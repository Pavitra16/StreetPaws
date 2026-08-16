import { z } from 'zod';

import { DogReport } from '../models/index.js';
import { Sighting } from '../models/Sighting.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { manageTokenMatches } from '../services/reportAccessService.js';
import { serializeReport } from '../utils/serialize.js';
import { toPoint } from '../utils/geo.js';

/**
 * Loads a report only if the caller holds its manage token.
 *
 * The token arrives in the query for a GET (it lives in the emailed URL) and in
 * the body for mutations, keeping it out of access logs where it can be.
 */
async function loadManageableReport(req) {
  const token = req.body?.token ?? req.query?.token;
  if (!token) throw new ApiError(401, 'This link is missing its access token');

  // tokenHash is select:false, so it has to be asked for explicitly.
  const report = await DogReport.findById(req.params.id).select('+manage.tokenHash');
  if (!report) throw ApiError.notFound('Report not found');

  /**
   * One message for every failure below: no token issued, wrong token, revoked
   * link. Distinguishing them tells someone probing a report id which of those
   * it is, and none of that is any of their business.
   */
  const bad =
    !report.manage?.tokenHash ||
    report.manage.revokedAt ||
    !manageTokenMatches(token, report.manage.tokenHash);

  if (bad) throw new ApiError(401, 'This link is no longer valid');

  return report;
}

/** GET /api/reports/:id/manage?token= */
export const getManagedReport = asyncHandler(async (req, res) => {
  const report = await loadManageableReport(req);
  const sightingCount = await Sighting.countDocuments({ dogReportId: report._id });

  res.json({
    // The owner wrote the contact details, so there is nothing to hide from them.
    ...serializeReport(report, { revealContact: true, allowOwnerConsent: true }),
    canManage: true,
    sightingCount,
  });
});

export const editManagedReportSchema = z.object({
  token: z.string().min(1),

  dogName: z.string().trim().max(80).optional(),
  description: z.string().trim().max(3000).optional(),
  breedGuess: z.string().trim().max(120).optional(),

  // Last-seen location. A dog that turned up three streets away means the search
  // should move with it, so this is editable rather than frozen at submit time.
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),

  // Whether the number stays published — the consent is theirs to withdraw.
  showPublicly: z.boolean().optional(),
});

/** PATCH /api/reports/:id/manage */
export const editManagedReport = asyncHandler(async (req, res) => {
  const report = await loadManageableReport(req);
  const b = req.body;

  for (const field of ['dogName', 'description', 'breedGuess']) {
    if (b[field] !== undefined) report[field] = b[field];
  }

  if (b.lat !== undefined && b.lng !== undefined) {
    report.location = toPoint({
      lat: b.lat,
      lng: b.lng,
      address: b.address,
      city: b.city ?? report.location?.city,
    });
  }

  if (b.showPublicly !== undefined) report.contact.showPublicly = b.showPublicly;

  await report.save();
  res.json({ ...serializeReport(report, { revealContact: true, allowOwnerConsent: true }), canManage: true });
});

export const resolveManagedReportSchema = z.object({
  token: z.string().min(1),
  /**
   * Only the two outcomes an owner can actually know about.
   *
   * 'assigned' / 'in_treatment' / 'resolved' are rescuer-driven and stay out of
   * reach: a reporter marking a case resolved would close it under a rescuer who
   * is on their way to the animal.
   */
  status: z.enum(['reunited', 'closed']),
  note: z.string().trim().max(1000).optional(),
});

/** POST /api/reports/:id/manage/resolve */
export const resolveManagedReport = asyncHandler(async (req, res) => {
  const report = await loadManageableReport(req);

  report.pushStatus(req.body.status, {
    note:
      req.body.note ??
      (req.body.status === 'reunited' ? 'Owner reported the dog is home' : 'Closed by the owner'),
  });

  /**
   * Closing retires the link. The report is done, and a live token sitting in an
   * inbox — or in a forwarded copy of that email — is an open door onto a page
   * nobody needs any more.
   */
  report.manage.revokedAt = new Date();

  await report.save();
  res.json({ ...serializeReport(report, { revealContact: true, allowOwnerConsent: true }), canManage: false });
});
