import { z } from 'zod';
import { DogReport } from '../models/index.js';
import { findMatches } from '../services/matchService.js';
import { embedImageByUrl } from '../services/embeddingService.js';
import { analyzeDogPhoto, isAiConfigured } from '../services/aiService.js';
import { serializeReport } from '../utils/serialize.js';
import { viewerCanSeeContact } from '../middleware/auth.js';
import { toPoint } from '../utils/geo.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const matchSchema = z
  .object({
    // Either match an existing report…
    reportId: z.string().length(24).optional(),
    // …or a one-off photo the owner just uploaded, without saving a report.
    imageUrl: z.string().url().optional(),

    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    lostAt: z.coerce.date().optional(),
    breed: z.string().trim().max(120).optional(),
    kind: z.enum(['found', 'lost']).default('found'),
    limit: z.coerce.number().min(1).max(50).default(20),
  })
  .refine((d) => d.reportId || d.imageUrl, {
    message: 'Provide either reportId or imageUrl',
    path: ['imageUrl'],
  });

/**
 * POST /api/search/match
 *
 * Ranks reports of the opposite kind against a query photo, combining visual
 * similarity with attributes, distance and time.
 */
export const matchReports = asyncHandler(async (req, res) => {
  const b = req.body;

  let queryEmbedding = null;
  let queryAnalysis = null;
  let queryLocation = null;
  let queryDate = b.lostAt ?? null;
  let excludeId = null;

  if (b.reportId) {
    const source = await DogReport.findById(b.reportId).select('+embedding');
    if (!source) throw ApiError.notFound('Report not found');

    excludeId = source._id;
    queryEmbedding = source.embedding?.length ? source.embedding : null;
    queryAnalysis = source.aiAnalysis;
    queryLocation = source.location;
    queryDate ??= source.occurredAt;

    if (!queryEmbedding) {
      const primary =
        source.media.find((m) => m.isPrimary && m.resourceType === 'image') ??
        source.media.find((m) => m.resourceType === 'image');
      if (primary) {
        queryEmbedding = await embedImageByUrl(primary.url).catch(() => null);
      }
    }
  } else {
    // Ad-hoc photo: embed it, and read its attributes if the vision model is up.
    // Both are best-effort — a failure here degrades ranking rather than 500s,
    // because the remaining signals still produce a useful list.
    const [embedding, analysis] = await Promise.all([
      embedImageByUrl(b.imageUrl).catch(() => null),
      isAiConfigured()
        ? analyzeDogPhoto({ publicId: null, imageUrl: b.imageUrl }).catch(() => null)
        : Promise.resolve(null),
    ]);
    queryEmbedding = embedding;
    queryAnalysis = analysis ?? (b.breed ? { breed: b.breed } : null);
  }

  if (b.lat != null && b.lng != null) queryLocation = toPoint({ lat: b.lat, lng: b.lng });
  if (b.breed) queryAnalysis = { ...(queryAnalysis ?? {}), breed: b.breed };

  const { matches, source, candidatesConsidered } = await findMatches({
    queryEmbedding,
    queryAnalysis,
    queryLocation,
    queryDate,
    excludeId,
    kind: b.kind,
    limit: b.limit,
  });

  const revealContact = await viewerCanSeeContact(req);

  res.json({
    results: matches.map((m) => ({
      ...serializeReport(m.doc, { revealContact }),
      matchScore: Number(m.score.toFixed(4)),
      matchBreakdown: m.breakdown,
      distanceKm: m.distanceKm,
    })),
    meta: {
      retrieval: source,
      candidatesConsidered,
      hadEmbedding: Boolean(queryEmbedding),
      hadAttributes: Boolean(queryAnalysis),
    },
  });
});
