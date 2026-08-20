import { z } from 'zod';

import { DogReport, CLOSED_STATUSES } from '../models/DogReport.js';
import { Sighting } from '../models/Sighting.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';
import { toPoint, fromPoint, haversineKm } from '../utils/geo.js';
import { sendSightingLogged } from '../services/emailService.js';
import { env } from '../config/env.js';

const mediaInput = z.object({
  cloudinaryPublicId: z.string().min(1),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  resourceType: z.enum(['image', 'video']).default('image'),
  width: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
  isPrimary: z.boolean().optional(),
});

export const createSightingSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),

  seenAt: z.coerce.date().optional(),
  note: z.string().trim().max(1000).optional(),
  media: z.array(mediaInput).max(4).default([]),

  // Every field here is optional: a pin alone is a useful sighting, and asking
  // a passer-by for their phone number before accepting it loses the pin.
  contact: z
    .object({
      name: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(20).optional(),
      email: z.string().trim().email().max(200).optional().or(z.literal('')),
    })
    .optional(),
});

function serializeSighting(sighting, { origin = null } = {}) {
  const json = typeof sighting.toJSON === 'function' ? sighting.toJSON() : { ...sighting };
  const coords = fromPoint(sighting.location);
  if (coords) {
    json.lat = coords.lat;
    json.lng = coords.lng;
    if (origin) json.distanceKm = Number(haversineKm(origin, coords).toFixed(2));
  }

  /**
   * A sighting reporter's number is never shown. They are a passer-by doing the
   * owner a favour, exactly the person the masking rule was written for — and
   * unlike a lost-dog owner they were never offered the choice to publish it.
   */
  if (json.contact) {
    json.contact = {
      name: json.contact.name ?? null,
      hasContactDetails: Boolean(json.contact.phone || json.contact.email),
    };
  }

  return json;
}

/** POST /api/reports/:id/sightings */
export const createSighting = asyncHandler(async (req, res) => {
  const report = await DogReport.findById(req.params.id);
  if (!report) throw ApiError.notFound('Report not found');
  if (report.kind !== 'lost') {
    throw ApiError.badRequest('Sightings can only be logged against a lost dog report');
  }

  /**
   * A dog that is already home cannot be sighted.
   *
   * Without this the owner kept getting "possible sighting of Rocky" emails for
   * a dog asleep on their sofa — the exact thing marking it reunited was meant
   * to stop. The page hides the form once a report is closed; this is the guard
   * for the link somebody kept open, or shared, before that happened.
   */
  if (CLOSED_STATUSES.includes(report.status)) {
    throw ApiError.badRequest(
      report.status === 'reunited'
        ? 'This dog has already been found — no more sightings are needed'
        : 'This report has been closed'
    );
  }

  const b = req.body;
  const hasContact = b.contact && (b.contact.name || b.contact.phone || b.contact.email);

  const sighting = await Sighting.create({
    dogReportId: report._id,
    location: toPoint({ lat: b.lat, lng: b.lng, address: b.address, city: b.city }),
    seenAt: b.seenAt ?? new Date(),
    note: b.note,
    media: b.media,
    contact: hasContact ? { ...b.contact, email: b.contact.email || undefined } : undefined,
  });

  const origin = fromPoint(report.location);
  const distanceKm = origin
    ? Number(haversineKm(origin, { lat: b.lat, lng: b.lng }).toFixed(2))
    : null;

  /**
   * Tell the owner, and do not make the sighting depend on it. Same reasoning as
   * the rescuer fan-out: the record is what matters, the email is best effort.
   */
  if (report.contact?.email) {
    sendSightingLogged({
      report,
      sighting,
      distanceKm,
      appUrl: env.clientOrigin,
    }).catch((err) => console.warn(`[sighting] owner email failed: ${err.message}`));
  }

  res.status(201).json(serializeSighting(sighting, { origin }));
});

/** GET /api/reports/:id/sightings */
export const listSightings = asyncHandler(async (req, res) => {
  const report = await DogReport.findById(req.params.id).select('location kind');
  if (!report) throw ApiError.notFound('Report not found');

  const sightings = await Sighting.find({ dogReportId: report._id }).sort({ seenAt: -1 }).limit(50);
  const origin = fromPoint(report.location);

  res.json({
    results: sightings.map((s) => serializeSighting(s, { origin })),
    total: sightings.length,
  });
});
