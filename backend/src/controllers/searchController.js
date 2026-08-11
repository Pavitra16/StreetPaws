import { z } from 'zod';
import { DogReport, CONDITIONS, REPORT_KINDS } from '../models/index.js';
import { withinRadius } from '../utils/geo.js';
import { serializeReport } from '../utils/serialize.js';
import { viewerCanSeeContact } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const nearQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.5).max(200).default(15),
  kind: z.enum(REPORT_KINDS).optional(),
  condition: z.enum(CONDITIONS).optional(),
  breed: z.string().trim().min(1).max(120).optional(),
  status: z.string().trim().optional(),
  minUrgency: z.coerce.number().min(1).max(5).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['distance', 'recent', 'urgency']).default('distance'),
  limit: z.coerce.number().min(1).max(100).default(50),
  page: z.coerce.number().min(1).default(1),
});

/** GET /api/search/near */
export const searchNear = asyncHandler(async (req, res) => {
  const q = req.query;
  const origin = { lat: q.lat, lng: q.lng };

  const filter = { location: withinRadius(q.lat, q.lng, q.radiusKm) };
  if (q.kind) filter.kind = q.kind;
  if (q.condition) filter.condition = q.condition;
  if (q.status) filter.status = { $in: q.status.split(',').map((s) => s.trim()) };
  // Filter and sort on the stored effective urgency, not the raw model score —
  // otherwise a reporter-flagged critical case with a low AI read would be
  // excluded from exactly the query meant to surface it.
  if (q.minUrgency) filter.effectiveUrgency = { $gte: q.minUrgency };

  if (q.breed) {
    // Match either the AI's read of the photo or what the owner typed, so a
    // "lost Labrador" report is findable before analysis has run.
    const rx = new RegExp(escapeRegex(q.breed), 'i');
    filter.$or = [{ 'aiAnalysis.breed': rx }, { breedGuess: rx }];
  }

  if (q.from || q.to) {
    filter.occurredAt = {};
    if (q.from) filter.occurredAt.$gte = q.from;
    if (q.to) filter.occurredAt.$lte = q.to;
  }

  const sortSpec = {
    recent: { occurredAt: -1 },
    urgency: { effectiveUrgency: -1, occurredAt: -1 },
    distance: null, // handled below
  }[q.sort];

  const skip = (q.page - 1) * q.limit;
  const [rawTotal, docs] = await Promise.all([
    DogReport.countDocuments(filter),
    sortSpec
      ? DogReport.find(filter).sort(sortSpec).skip(skip).limit(q.limit)
      : // $geoWithin does not order by distance, and $near cannot be combined
        // with skip reliably at scale — for a city-sized radius, sorting the
        // page in memory is both correct and fast.
        DogReport.find(filter).limit(500),
  ]);

  /**
   * List views NEVER reveal contact details, even to a verified organisation.
   *
   * Revealing on a single report is a deliberate act on one animal. Revealing
   * across a paginated search turns this endpoint into a bulk export of every
   * reporter's phone number — one request, fifty numbers. Rescuers get the
   * number by opening the report they intend to act on.
   */
  let results = docs.map((d) => serializeReport(d, { revealContact: false, origin }));

  if (!sortSpec) {
    results.sort((a, b) => a.distanceKm - b.distanceKm);
    results = results.slice(skip, skip + q.limit);
  }

  res.json({
    results,
    total: rawTotal,
    page: q.page,
    limit: q.limit,
    hasMore: skip + results.length < rawTotal,
    origin,
    radiusKm: q.radiusKm,
  });
});

export const getReport = asyncHandler(async (req, res) => {
  const report = await DogReport.findById(req.params.id).populate(
    'assignedOrganizationId',
    'name kind phone verified'
  );
  if (!report) throw ApiError.notFound('Report not found');
  res.json(serializeReport(report, { revealContact: await viewerCanSeeContact(req) }));
});

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
