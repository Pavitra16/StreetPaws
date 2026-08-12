import { z } from 'zod';
import { Organization, Alert, DogReport } from '../models/index.js';
import { toPoint, withinRadius, fromPoint, haversineKm } from '../utils/geo.js';
import { serializeOrganization, serializeReport } from '../utils/serialize.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

const SPECIALIZATIONS = [
  'injury', 'surgery', 'skin_disease', 'puppies', 'sterilization', 'rabies', 'shelter', 'transport',
];

export const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(200),
  kind: z.enum(['ngo', 'private_helper']),
  description: z.string().trim().max(2000).optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  serviceRadiusKm: z.coerce.number().min(1).max(100).default(10),
  phone: z.string().trim().min(6).max(20),
  email: z.string().trim().email().max(200),
  website: z.string().trim().url().max(300).optional().or(z.literal('')),
  capacity: z.coerce.number().min(0).max(500).default(5),
  specializations: z.array(z.enum(SPECIALIZATIONS)).default([]),
  // Supporting detail for the admin reviewing the application.
  registrationNumber: z.string().trim().max(120).optional(),
  contactPersonName: z.string().trim().max(120).optional(),
  yearsActive: z.coerce.number().min(0).max(100).optional(),

  // Required of everyone. It is the only identifier that is nationally unique
  // for both an organisation and an individual, so it is what "you have already
  // registered" can actually be checked against.
  pan: z
    .string({ required_error: 'PAN is required' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid 10-character PAN, e.g. AABCT1234H'),
  darpanId: z.string().trim().toUpperCase().max(40).optional().or(z.literal('')),
});

export const orgsNearSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.5).max(200).default(25),
  kind: z.enum(['ngo', 'private_helper']).optional(),
  specialization: z.enum(SPECIALIZATIONS).optional(),
});

/**
 * POST /api/organizations — a public *application*, not a registration.
 *
 * Creates a pending record with no login and no alerts. An admin reviews it, and
 * approval is what creates the account. Anyone can therefore apply without that
 * granting any access.
 */
export const applyAsOrganization = asyncHandler(async (req, res) => {
  const b = req.body;

  /**
   * Friendly duplicate checks. The database enforces these too (see the partial
   * unique indexes on Organization) — this exists only so the applicant gets a
   * message naming the field, rather than a bare "duplicate value".
   */
  const live = { applicationStatus: { $in: ['pending', 'approved'] } };
  const clash = await Organization.findOne({
    ...live,
    $or: [
      { email: b.email },
      { pan: b.pan.toUpperCase() },
      ...(b.phone ? [{ phone: b.phone }] : []),
    ],
  });

  if (clash) {
    const already = clash.applicationStatus === 'pending' ? 'awaiting review' : 'already registered';
    if (clash.pan === b.pan.toUpperCase()) {
      throw ApiError.conflict(
        `An application with this PAN is ${already}. If this is you, sign in or use “Forgot password?”.`
      );
    }
    if (clash.email === b.email) {
      throw ApiError.conflict(`An application with this email is ${already}.`);
    }
    throw ApiError.conflict(`An application with this phone number is ${already}.`);
  }

  const org = await Organization.create({
    name: b.name,
    kind: b.kind,
    description: b.description,
    location: toPoint({ lat: b.lat, lng: b.lng, address: b.address, city: b.city, state: b.state }),
    serviceRadiusKm: b.serviceRadiusKm,
    phone: b.phone,
    email: b.email,
    website: b.website || undefined,
    capacity: b.capacity,
    specializations: b.specializations,
    registrationNumber: b.registrationNumber,
    contactPersonName: b.contactPersonName,
    yearsActive: b.yearsActive,
    pan: b.pan || undefined,
    darpanId: b.darpanId || undefined,
    applicationStatus: 'pending',
    active: false,
    verified: false,
  });

  res.status(201).json({
    ok: true,
    message: 'Application received. An administrator will review it and email you.',
    organization: { id: org.id, name: org.name, applicationStatus: org.applicationStatus },
  });
});

/** GET /api/organizations/near — approved organisations only. */
export const organizationsNear = asyncHandler(async (req, res) => {
  const q = req.query;
  const filter = {
    ...Organization.operationalFilter(),
    location: withinRadius(q.lat, q.lng, q.radiusKm),
  };
  if (q.kind) filter.kind = q.kind;
  if (q.specialization) filter.specializations = q.specialization;

  const orgs = await Organization.find(filter).limit(100);
  const origin = { lat: q.lat, lng: q.lng };
  const results = orgs
    .map((o) => serializeOrganization(o, { origin }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  res.json({ results, total: results.length });
});

export const getOrganization = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.params.id);
  if (!org) throw ApiError.notFound('Organisation not found');

  // A pending or rejected application is not public — only an admin, or the
  // organisation's own user, may look at it.
  const isOwn = req.user && String(req.user.organizationId ?? '') === String(org._id);
  if (org.applicationStatus !== 'approved' && req.user?.role !== 'admin' && !isOwn) {
    throw ApiError.notFound('Organisation not found');
  }

  res.json(serializeOrganization(org));
});

/**
 * GET /api/organizations/:id/queue
 *
 * The responder's working view: everything they have been alerted about that
 * still needs a decision or action, worst first.
 */
export const organizationQueue = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.params.id);
  if (!org) throw ApiError.notFound('Organisation not found');

  const status = req.query.status ?? 'sent,viewed,accepted';
  const alerts = await Alert.find({
    organizationId: org._id,
    status: { $in: status.split(',').map((s) => s.trim()) },
  })
    .sort({ urgency: -1, sentAt: -1 })
    .limit(100)
    .populate('dogReportId');

  const origin = fromPoint(org.location);

  const items = alerts
    .filter((a) => a.dogReportId) // report deleted since the alert was sent
    .map((a) => {
      const report = a.dogReportId;
      const coords = fromPoint(report.location);
      return {
        alertId: a.id,
        alertStatus: a.status,
        sentAt: a.sentAt,
        respondedAt: a.respondedAt,
        routingScore: a.routingScore,
        distanceKm:
          a.distanceKm ?? (origin && coords ? Number(haversineKm(origin, coords).toFixed(2)) : null),
        // Verified organisations get the reporter's real number — they need to
        // call about the animal. Unverified ones see the masked view.
        report: serializeReport(report, { revealContact: org.verified }),
      };
    });

  res.json({
    organization: serializeOrganization(org),
    items,
    counts: {
      pending: items.filter((i) => i.alertStatus === 'sent' || i.alertStatus === 'viewed').length,
      accepted: items.filter((i) => i.alertStatus === 'accepted').length,
    },
  });
});

export const respondSchema = z.object({
  decision: z.enum(['accept', 'decline', 'view']),
  reason: z.string().trim().max(500).optional(),
});

/**
 * POST /api/organizations/:id/alerts/:alertId/respond
 *
 * Accepting takes ownership of the case: the report is assigned, the org's
 * active load goes up, and its response stats are updated.
 */
export const respondToAlert = asyncHandler(async (req, res) => {
  const { id, alertId } = req.params;
  const { decision, reason } = req.body;

  const alert = await Alert.findOne({ _id: alertId, organizationId: id });
  if (!alert) throw ApiError.notFound('Alert not found');

  if (decision === 'view') {
    if (alert.status === 'sent') {
      alert.status = 'viewed';
      alert.viewedAt = new Date();
      await alert.save();
    }
    return res.json({ ok: true, status: alert.status });
  }

  if (alert.status === 'accepted' || alert.status === 'declined') {
    throw ApiError.conflict(`This alert was already ${alert.status}`);
  }

  const report = await DogReport.findById(alert.dogReportId);
  if (!report) throw ApiError.notFound('The report no longer exists');

  alert.respondedAt = new Date();

  if (decision === 'decline') {
    alert.status = 'declined';
    alert.declineReason = reason;
    await alert.save();
    return res.json({ ok: true, status: 'declined' });
  }

  // Accept — but only if nobody else already took it.
  if (report.assignedOrganizationId && String(report.assignedOrganizationId) !== String(id)) {
    alert.status = 'expired';
    await alert.save();
    throw ApiError.conflict('Another rescuer has already taken this case');
  }

  alert.status = 'accepted';
  await alert.save();

  report.assignedOrganizationId = alert.organizationId;
  report.pushStatus('assigned', { note: 'Rescuer accepted the case', byOrganizationId: alert.organizationId });
  await report.save();

  const minutes = Math.max(0, Math.round((alert.respondedAt - alert.sentAt) / 60000));
  const org = await Organization.findById(id);
  const prevAccepted = org.responseStats?.accepted ?? 0;
  const prevAvg = org.responseStats?.avgResponseMinutes;

  org.activeCaseCount = (org.activeCaseCount ?? 0) + 1;
  org.responseStats.accepted = prevAccepted + 1;
  // Running mean, so we never have to re-scan every past alert.
  org.responseStats.avgResponseMinutes =
    prevAvg == null ? minutes : Math.round((prevAvg * prevAccepted + minutes) / (prevAccepted + 1));
  await org.save();

  // Everyone else's alert for this report is now moot.
  await Alert.updateMany(
    { dogReportId: report._id, _id: { $ne: alert._id }, status: { $in: ['sent', 'viewed'] } },
    { $set: { status: 'expired', respondedAt: new Date() } }
  );

  res.json({ ok: true, status: 'accepted', report: serializeReport(report, { revealContact: true }) });
});

export const resolveSchema = z.object({
  status: z.enum(['in_treatment', 'resolved', 'reunited', 'closed']),
  note: z.string().trim().max(1000).optional(),
});

/** POST /api/organizations/:id/reports/:reportId/resolve */
export const updateCaseStatus = asyncHandler(async (req, res) => {
  const { id, reportId } = req.params;
  const { status, note } = req.body;

  const report = await DogReport.findById(reportId);
  if (!report) throw ApiError.notFound('Report not found');
  if (String(report.assignedOrganizationId) !== String(id)) {
    throw ApiError.badRequest('This case is not assigned to your organisation');
  }

  const wasOpen = !['resolved', 'reunited', 'closed'].includes(report.status);
  report.pushStatus(status, { note, byOrganizationId: id });
  await report.save();

  // Free the slot once the case actually closes.
  if (wasOpen && ['resolved', 'reunited', 'closed'].includes(status)) {
    await Organization.updateOne(
      { _id: id },
      { $inc: { activeCaseCount: -1, 'responseStats.resolved': 1 } }
    );
  }

  res.json(serializeReport(report, { revealContact: true }));
});
