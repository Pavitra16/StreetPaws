import { z } from 'zod';
import { AdoptionListing, AdoptionApplication, Organization } from '../models/index.js';
import { withinRadius, fromPoint, haversineKm } from '../utils/geo.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

const mediaInput = z.object({
  cloudinaryPublicId: z.string().min(1),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  resourceType: z.enum(['image', 'video']).default('image'),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  isPrimary: z.boolean().optional(),
});

export const listingsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(500).default(50),
  city: z.string().trim().max(120).optional(),
  breed: z.string().trim().max(120).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  sex: z.enum(['male', 'female', 'unknown']).optional(),
  goodWithKids: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(100).default(40),
});

function serializeListing(listing, { origin } = {}) {
  const json = listing.toJSON ? listing.toJSON() : { ...listing };
  const coords = fromPoint(listing.location);
  if (coords) {
    json.lat = coords.lat;
    json.lng = coords.lng;
    if (origin) json.distanceKm = Number(haversineKm(origin, coords).toFixed(2));
  }
  json.primaryMedia = json.media?.find((m) => m.isPrimary) ?? json.media?.[0] ?? null;
  return json;
}

/**
 * GET /api/adoptions
 *
 * Only ever returns listings from approved, active organisations. The listing's
 * own status is not enough — an organisation suspended after posting must not
 * keep advertising dogs, so the owner is checked on every read.
 */
export const listAdoptions = asyncHandler(async (req, res) => {
  const q = req.query;

  const approvedOrgs = await Organization.find(Organization.operationalFilter()).select('_id');
  const approvedIds = approvedOrgs.map((o) => o._id);

  const filter = {
    status: 'available',
    organizationId: { $in: approvedIds },
  };

  if (q.lat != null && q.lng != null) filter.location = withinRadius(q.lat, q.lng, q.radiusKm);
  if (q.city) filter['location.city'] = new RegExp(escapeRegex(q.city), 'i');
  if (q.breed) filter.breed = new RegExp(escapeRegex(q.breed), 'i');
  if (q.size) filter.size = q.size;
  if (q.sex) filter.sex = q.sex;
  if (q.goodWithKids) filter['goodWith.kids'] = true;

  const listings = await AdoptionListing.find(filter)
    .sort({ createdAt: -1 })
    .limit(q.limit)
    .populate('organizationId', 'name kind phone email verified location');

  const origin = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
  let results = listings.map((l) => serializeListing(l, { origin }));
  if (origin) results.sort((a, b) => a.distanceKm - b.distanceKm);

  res.json({ results, total: results.length });
});

export const getAdoption = asyncHandler(async (req, res) => {
  const listing = await AdoptionListing.findById(req.params.id).populate(
    'organizationId',
    'name kind phone email verified description location applicationStatus active'
  );
  if (!listing) throw ApiError.notFound('Listing not found');

  const org = listing.organizationId;
  if (!org || org.applicationStatus !== 'approved' || !org.active) {
    throw ApiError.notFound('Listing not found');
  }

  res.json(serializeListing(listing));
});

export const createListingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  story: z.string().trim().max(3000).optional(),
  media: z.array(mediaInput).min(1, 'Add at least one photo').max(8),
  breed: z.string().trim().max(120).optional(),
  ageMonths: z.coerce.number().min(0).max(300).optional(),
  sex: z.enum(['male', 'female', 'unknown']).default('unknown'),
  size: z.enum(['small', 'medium', 'large']).default('medium'),
  vaccinated: z.boolean().default(false),
  sterilized: z.boolean().default(false),
  specialNeeds: z.string().trim().max(1000).optional(),
  temperament: z
    .array(z.enum(['calm', 'playful', 'shy', 'protective', 'energetic', 'affectionate']))
    .default([]),
  goodWith: z
    .object({
      kids: z.boolean().nullable().default(null),
      dogs: z.boolean().nullable().default(null),
      cats: z.boolean().nullable().default(null),
    })
    .default({}),
  adoptionFee: z.coerce.number().min(0).default(0),
  sourceReportId: z.string().length(24).optional(),
});

/** POST /api/adoptions — the signed-in organisation lists a dog. */
export const createListing = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organizationId);
  if (!org || org.applicationStatus !== 'approved' || !org.active) {
    throw new ApiError(403, 'Your organisation is not approved to list dogs for adoption');
  }

  const b = req.body;
  const media = b.media.map((m, i) => ({
    ...m,
    isPrimary: b.media.some((x) => x.isPrimary) ? Boolean(m.isPrimary) : i === 0,
  }));

  const listing = await AdoptionListing.create({
    ...b,
    media,
    organizationId: org._id,
    // Denormalised from the organisation so "adoptable dogs near me" is one query.
    location: org.location,
  });

  res.status(201).json(serializeListing(listing));
});

export const updateListingSchema = z.object({
  status: z.enum(['available', 'pending', 'adopted', 'withdrawn']),
});

export const updateListing = asyncHandler(async (req, res) => {
  const listing = await AdoptionListing.findById(req.params.id);
  if (!listing) throw ApiError.notFound('Listing not found');
  if (String(listing.organizationId) !== String(req.user.organizationId) && req.user.role !== 'admin') {
    throw new ApiError(403, 'This listing belongs to another organisation');
  }

  listing.status = req.body.status;
  await listing.save();
  res.json(serializeListing(listing));
});

export const applySchema = z.object({
  applicant: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(6).max(20),
    email: z.string().trim().email().max(200).optional().or(z.literal('')),
  }),
  city: z.string().trim().max(120).optional(),
  homeType: z.enum(['apartment', 'independent_house', 'farm', 'other']).optional(),
  hasOutdoorSpace: z.boolean().default(false),
  hasOtherPets: z.boolean().default(false),
  otherPetsDetail: z.string().trim().max(500).optional(),
  householdAdults: z.coerce.number().min(0).max(50).optional(),
  hasChildren: z.boolean().default(false),
  experience: z.string().trim().max(2000).optional(),
  reason: z.string().trim().max(2000).optional(),
});

/** POST /api/adoptions/:id/apply — public, no account needed. */
export const applyForAdoption = asyncHandler(async (req, res) => {
  const listing = await AdoptionListing.findById(req.params.id).populate('organizationId');
  if (!listing) throw ApiError.notFound('Listing not found');

  const org = listing.organizationId;
  if (!org || org.applicationStatus !== 'approved' || !org.active) {
    throw ApiError.notFound('Listing not found');
  }
  if (listing.status !== 'available') {
    throw ApiError.conflict('This dog is no longer available for adoption');
  }

  const b = req.body;
  const application = await AdoptionApplication.create({
    listingId: listing._id,
    organizationId: org._id,
    applicant: { ...b.applicant, email: b.applicant.email || undefined },
    city: b.city,
    homeType: b.homeType,
    hasOutdoorSpace: b.hasOutdoorSpace,
    hasOtherPets: b.hasOtherPets,
    otherPetsDetail: b.otherPetsDetail,
    householdAdults: b.householdAdults,
    hasChildren: b.hasChildren,
    experience: b.experience,
    reason: b.reason,
  });

  res.status(201).json({
    ok: true,
    message: `${org.name} will contact you about ${listing.name}.`,
    applicationId: application.id,
  });
});

/**
 * GET /api/adoptions/mine — the organisation's own listings, any status.
 *
 * Distinct from the public list, which only ever shows `available` dogs from
 * approved organisations. A rescuer needs to see their adopted and withdrawn
 * ones too, or they cannot tell what they have already placed.
 */
export const myListings = asyncHandler(async (req, res) => {
  const listings = await AdoptionListing.find({ organizationId: req.user.organizationId })
    .sort({ createdAt: -1 })
    .limit(100);

  const counts = listings.reduce((acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + 1 }), {});

  res.json({ results: listings.map((l) => serializeListing(l)), counts, total: listings.length });
});

/** GET /api/adoptions/applications — the organisation's own inbox. */
export const listApplications = asyncHandler(async (req, res) => {
  const applications = await AdoptionApplication.find({ organizationId: req.user.organizationId })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('listingId', 'name media status');

  res.json({ results: applications.map((a) => a.toJSON()) });
});

export const reviewApplicationSchema = z.object({
  status: z.enum(['reviewing', 'approved', 'rejected']),
  reviewNote: z.string().trim().max(2000).optional(),
});

export const reviewApplication = asyncHandler(async (req, res) => {
  const application = await AdoptionApplication.findById(req.params.id);
  if (!application) throw ApiError.notFound('Application not found');
  if (String(application.organizationId) !== String(req.user.organizationId) && req.user.role !== 'admin') {
    throw new ApiError(403, 'This application belongs to another organisation');
  }

  application.status = req.body.status;
  application.reviewNote = req.body.reviewNote;
  application.reviewedAt = new Date();
  await application.save();

  // Approving an adopter takes the dog off the board — otherwise two families
  // are told they can have the same dog.
  if (req.body.status === 'approved') {
    await AdoptionListing.updateOne({ _id: application.listingId }, { $set: { status: 'adopted' } });
  }

  res.json(application.toJSON());
});

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
