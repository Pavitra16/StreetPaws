import { z } from 'zod';
import {
  Organization,
  User,
  DogReport,
  Alert,
  AdoptionListing,
  Donation,
  Disbursement,
} from '../models/index.js';
import { hashPassword, generateTempPassword } from '../services/authService.js';
import { sendOrganizationApproved, sendOrganizationRejected } from '../services/emailService.js';
import { serializeOrganization, serializeReport } from '../utils/serialize.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const listApplicationsSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'suspended', 'all']).default('pending'),
  // Lets the NGO and rescuer tabs be the same endpoint with a different filter,
  // rather than two near-identical queries.
  kind: z.enum(['ngo', 'private_helper']).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

/** GET /api/admin/organizations */
export const listOrganizations = asyncHandler(async (req, res) => {
  const { status, kind, search, limit } = req.query;

  const filter = {};
  if (status !== 'all') filter.applicationStatus = status;
  if (kind) filter.kind = kind;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { contactPersonName: rx }, { 'location.city': rx }];
  }

  const orgs = await Organization.find(filter).sort({ createdAt: -1 }).limit(limit);

  // Counts are always over ALL organisations, not the filtered view — the tab
  // badges must not change depending on which tab you are looking at.
  const [statusCounts, kindCounts] = await Promise.all([
    Organization.aggregate([{ $group: { _id: '$applicationStatus', n: { $sum: 1 } } }]),
    Organization.aggregate([
      { $match: { applicationStatus: 'approved' } },
      { $group: { _id: '$kind', n: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    results: orgs.map((o) => serializeOrganization(o)),
    counts: Object.fromEntries(statusCounts.map((c) => [c._id, c.n])),
    approvedByKind: Object.fromEntries(kindCounts.map((c) => [c._id, c.n])),
  });
});

export const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject', 'suspend']),
  note: z.string().trim().max(1000).optional(),
  // Approval optionally grants access to reporter phone numbers. Kept separate
  // from approval itself so an admin can let an organisation start work before
  // deciding it should see personal data.
  verified: z.boolean().default(false),
  ownerEmail: z.string().trim().toLowerCase().email().optional(),
  ownerName: z.string().trim().max(120).optional(),
});

/**
 * POST /api/admin/organizations/:id/review
 *
 * Approving creates the organisation's login account and returns a one-time
 * password for the admin to pass on.
 */
export const reviewOrganization = asyncHandler(async (req, res) => {
  const { decision, note, verified, ownerEmail, ownerName } = req.body;
  const org = await Organization.findById(req.params.id);
  if (!org) throw ApiError.notFound('Organisation not found');

  org.reviewedAt = new Date();
  org.reviewedByUserId = req.user.id;
  org.reviewNote = note;

  if (decision === 'reject' || decision === 'suspend') {
    org.applicationStatus = decision === 'reject' ? 'rejected' : 'suspended';
    org.active = false;
    await org.save();

    // Deny the login too, or a suspended organisation keeps its session.
    if (org.ownerUserId) await User.updateOne({ _id: org.ownerUserId }, { $set: { active: false } });

    if (decision === 'reject') {
      await sendOrganizationRejected(org, note).catch((e) =>
        console.warn('[admin] rejection email failed:', e.message)
      );
    }
    return res.json({ organization: serializeOrganization(org) });
  }

  // Approve
  org.applicationStatus = 'approved';
  org.active = true;
  org.verified = verified;

  let credentials = null;

  if (!org.ownerUserId) {
    const email = ownerEmail ?? org.email;
    const existing = await User.findOne({ email });

    if (existing) {
      // Reactivate rather than fail — a rejected applicant reapplying is normal.
      existing.role = org.kind === 'ngo' ? 'ngo' : 'helper';
      existing.organizationId = org._id;
      existing.active = true;
      await existing.save();
      org.ownerUserId = existing._id;
    } else {
      const tempPassword = generateTempPassword();
      const user = await User.create({
        name: ownerName ?? org.contactPersonName ?? org.name,
        email,
        phone: org.phone,
        role: org.kind === 'ngo' ? 'ngo' : 'helper',
        organizationId: org._id,
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
      });
      org.ownerUserId = user._id;
      // Returned once, never stored in plain text.
      credentials = { email, tempPassword };
    }
  }

  await org.save();

  // Report what actually happened, not what we attempted. This previously
  // returned `emailed: Boolean(credentials)` — true whenever an account was
  // created, even when no mail server exists — so the admin was told the
  // credentials had been sent when nothing had left the building.
  const delivery = await sendOrganizationApproved(org, credentials).catch((e) => {
    console.warn('[admin] approval email failed:', e.message);
    return { sent: false, reason: e.message };
  });

  res.json({
    organization: serializeOrganization(org),
    credentials,
    emailed: Boolean(delivery?.sent),
    emailReason: delivery?.sent ? null : (delivery?.reason ?? 'smtp_not_configured'),
  });
});

/**
 * GET /api/admin/organizations/:id/detail
 *
 * Everything an admin needs to judge one organisation: not just what they
 * registered as, but what they have actually done. Registration details are
 * claims; alert response and resolved cases are evidence.
 */
export const organizationDetail = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.params.id).populate('ownerUserId', 'name email lastLoginAt active');
  if (!org) throw ApiError.notFound('Organisation not found');

  const orgId = org._id;

  const [alertBreakdown, caseBreakdown, recentCases, listingStats, donationTotal, payoutTotal] =
    await Promise.all([
      Alert.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      DogReport.aggregate([
        { $match: { assignedOrganizationId: orgId } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      DogReport.find({ assignedOrganizationId: orgId })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('kind condition effectiveUrgency status media aiAnalysis description occurredAt updatedAt location'),
      AdoptionListing.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      Donation.aggregate([
        { $match: { status: 'paid', 'target.organizationId': orgId } },
        { $group: { _id: null, total: { $sum: '$amountPaise' }, n: { $sum: 1 } } },
      ]),
      Disbursement.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: null, total: { $sum: '$amountPaise' }, n: { $sum: 1 } } },
      ]),
    ]);

  const alerts = Object.fromEntries(alertBreakdown.map((a) => [a._id, a.n]));
  const cases = Object.fromEntries(caseBreakdown.map((c) => [c._id, c.n]));
  const listings = Object.fromEntries(listingStats.map((l) => [l._id, l.n]));

  const alerted = Object.values(alerts).reduce((s, n) => s + n, 0);
  const accepted = alerts.accepted ?? 0;
  const declined = alerts.declined ?? 0;
  const answered = accepted + declined;

  res.json({
    organization: serializeOrganization(org),
    owner: org.ownerUserId ?? null,
    performance: {
      alertsReceived: alerted,
      accepted,
      declined,
      // Distinguishes "said no" from "never opened it" — a rescuer who declines
      // honestly is far more useful than one who ignores everything.
      unanswered: (alerts.sent ?? 0) + (alerts.viewed ?? 0),
      expired: alerts.expired ?? 0,
      acceptanceRate: answered ? accepted / answered : null,
      responseRate: alerted ? answered / alerted : null,
      avgResponseMinutes: org.responseStats?.avgResponseMinutes ?? null,
      casesResolved: (cases.resolved ?? 0) + (cases.reunited ?? 0),
      casesInTreatment: cases.in_treatment ?? 0,
      casesAssigned: cases.assigned ?? 0,
      activeCaseCount: org.activeCaseCount ?? 0,
      capacity: org.capacity ?? 0,
    },
    adoption: {
      available: listings.available ?? 0,
      adopted: listings.adopted ?? 0,
      total: Object.values(listings).reduce((s, n) => s + n, 0),
    },
    money: {
      donationsReceivedInr: (donationTotal[0]?.total ?? 0) / 100,
      donationCount: donationTotal[0]?.n ?? 0,
      payoutsReceivedInr: (payoutTotal[0]?.total ?? 0) / 100,
      payoutCount: payoutTotal[0]?.n ?? 0,
    },
    recentCases: recentCases.map((r) => serializeReport(r, { revealContact: true })),
  });
});

/** GET /api/admin/stats — a small operational overview. */
export const adminStats = asyncHandler(async (req, res) => {
  const [orgCounts, reportCounts, alertCounts, unassigned, kindCounts] = await Promise.all([
    Organization.aggregate([{ $group: { _id: '$applicationStatus', n: { $sum: 1 } } }]),
    DogReport.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Alert.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    // The number that matters most: urgent cases nobody has taken.
    DogReport.countDocuments({ status: 'open', effectiveUrgency: { $gte: 4 } }),
    Organization.aggregate([
      { $match: { applicationStatus: 'approved' } },
      { $group: { _id: '$kind', n: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    organizations: Object.fromEntries(orgCounts.map((c) => [c._id, c.n])),
    approvedByKind: Object.fromEntries(kindCounts.map((c) => [c._id, c.n])),
    reports: Object.fromEntries(reportCounts.map((c) => [c._id, c.n])),
    alerts: Object.fromEntries(alertCounts.map((c) => [c._id, c.n])),
    urgentUnassigned: unassigned,
  });
});
