import { z } from 'zod';
import { DogReport, CONDITIONS, REPORT_KINDS, REPORT_STATUSES } from '../models/index.js';
import { toPoint } from '../utils/geo.js';
import { serializeReport } from '../utils/serialize.js';
import { viewerCanSeeContact } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { queueAnalysis } from '../jobs/analyzeReport.js';
import { createManageToken, buildManageUrl } from '../services/reportAccessService.js';
import { sendReportManageLink } from '../services/emailService.js';
import { env } from '../config/env.js';

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
      showPublicly: z.boolean().default(false),
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

  /**
   * A manage link, for a lost report with an email on it.
   *
   * Lost only: a found report's reporter is a bystander, not the animal's owner,
   * and handing them a "mark resolved" button would let a passer-by close a case
   * a rescuer is actively working. Their report is managed by the organisation
   * that accepted it.
   */
  const issueManageToken = b.kind === 'lost' && Boolean(b.contact.email);
  const manage = issueManageToken ? createManageToken() : null;

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
    contact: {
      ...b.contact,
      email: b.contact.email || undefined,
      // Only an owner looking for their own dog can publish their number. A
      // found report has a bystander's number on it, and it is not theirs to
      // publish — refusing here means a crafted payload cannot do it either.
      showPublicly: b.kind === 'lost' && b.contact.showPublicly === true,
    },
    description: b.description,
    condition: b.condition,
    dogName: b.dogName,
    breedGuess: b.breedGuess,
    occurredAt: b.occurredAt ?? new Date(),
    analysisState: 'pending',
    statusHistory: [{ status: 'open', at: new Date(), note: 'Report submitted' }],
    ...(manage ? { manage: { tokenHash: manage.tokenHash, issuedAt: manage.issuedAt } } : {}),
  });

  // Deliberately not awaited.
  queueAnalysis(report.id);

  if (manage) {
    // Best effort, like every other email here: the token is already stored, so
    // a dead SMTP server costs the owner their link, not their report. The
    // response carries the URL too, which is what the confirmation screen shows.
    sendReportManageLink({
      report,
      manageUrl: buildManageUrl({
        appUrl: env.clientOrigin,
        reportId: report.id,
        token: manage.token,
      }),
    }).catch((err) => console.warn(`[report] manage link email failed: ${err.message}`));
  }

  /**
   * The manage URL is returned exactly once, here.
   *
   * Email delivery fails quietly and often — wrong address, full mailbox, spam
   * folder — and an owner who never receives the link cannot get another one,
   * because proving they filed the report is the very thing the link does. The
   * confirmation screen shows it so there is a copy that does not depend on SMTP.
   */
  res.status(201).json({
    ...serializeReport(report, { revealContact: true }),
    ...(manage
      ? {
          manageUrl: buildManageUrl({
            appUrl: env.clientOrigin,
            reportId: report.id,
            token: manage.token,
          }),
        }
      : {}),
  });
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
  res.json(
    serializeReport(report, {
      revealContact: await viewerCanSeeContact(req),
      allowOwnerConsent: true,
    })
  );
});
