import { z } from 'zod';
import { DogReport, CONDITIONS, REPORT_KINDS, REPORT_STATUSES } from '../models/index.js';
import { toPoint } from '../utils/geo.js';
import { serializeReport } from '../utils/serialize.js';
import { viewerCanSeeContact } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { queueAnalysis } from '../jobs/analyzeReport.js';

const mediaInput = z.object({
  cloudinaryPublicId: z.string().min(1),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  resourceType: z.enum(['image', 'video']).default('image'),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  isPrimary: z.boolean().optional(),
});

export const createReportSchema = z
  .object({
    kind: z.enum(REPORT_KINDS),
    media: z.array(mediaInput).min(1, 'Add at least one photo').max(8),

    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    address: z.string().trim().max(500).optional(),
    city: z.string().trim().max(120).optional(),
    state: z.string().trim().max(120).optional(),
    pincode: z.string().trim().max(12).optional(),

    contact: z.object({
      name: z.string().trim().min(1, 'Your name is required').max(120),
      phone: z
        .string()
        .trim()
        .min(6, 'A reachable phone number is required')
        .max(20)
        .regex(/^[+\d][\d\s-]*$/, 'Enter a valid phone number'),
      email: z.string().trim().email().max(200).optional().or(z.literal('')),
      preferredChannel: z.enum(['phone', 'whatsapp', 'email']).default('phone'),
    }),

    description: z.string().trim().max(3000).optional(),
    condition: z.enum(CONDITIONS).default('healthy'),
    dogName: z.string().trim().max(80).optional(),
    breedGuess: z.string().trim().max(120).optional(),
    occurredAt: z.coerce.date().optional(),
  })
  .refine((d) => d.kind !== 'lost' || Boolean(d.dogName), {
    message: 'Tell us your dog’s name so others can recognise the report',
    path: ['dogName'],
  });

/**
 * POST /api/reports
 *
 * Saves and responds immediately, then kicks off AI analysis in the background.
 * The person filling this in is standing next to an injured animal — making them
 * wait ~8s for a vision model before they get confirmation is the wrong trade.
 */
export const createReport = asyncHandler(async (req, res) => {
  const b = req.body;

  const media = b.media.map((m, i) => ({
    ...m,
    // Guarantee exactly one primary, defaulting to the first image.
    isPrimary: b.media.some((x) => x.isPrimary) ? Boolean(m.isPrimary) : i === 0,
  }));

  const report = await DogReport.create({
    kind: b.kind,
    media,
    location: toPoint({
      lat: b.lat,
      lng: b.lng,
      address: b.address,
      city: b.city,
      state: b.state,
      pincode: b.pincode,
    }),
    contact: { ...b.contact, email: b.contact.email || undefined },
    description: b.description,
    condition: b.condition,
    dogName: b.dogName,
    breedGuess: b.breedGuess,
    occurredAt: b.occurredAt ?? new Date(),
    analysisState: 'pending',
    statusHistory: [{ status: 'open', at: new Date(), note: 'Report submitted' }],
  });

  // Deliberately not awaited.
  queueAnalysis(report.id);

  res.status(201).json(serializeReport(report, { revealContact: true }));
});

export const updateStatusSchema = z.object({
  status: z.enum(REPORT_STATUSES),
  note: z.string().trim().max(1000).optional(),
  organizationId: z.string().length(24).optional(),
});

/** PATCH /api/reports/:id/status */
export const updateReportStatus = asyncHandler(async (req, res) => {
  const report = await DogReport.findById(req.params.id);
  if (!report) throw ApiError.notFound('Report not found');

  report.pushStatus(req.body.status, {
    note: req.body.note,
    byOrganizationId: req.body.organizationId,
  });
  if (req.body.organizationId) report.assignedOrganizationId = req.body.organizationId;

  await report.save();
  res.json(serializeReport(report, { revealContact: await viewerCanSeeContact(req) }));
});
