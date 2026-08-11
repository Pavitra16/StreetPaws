import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { formLimiter } from '../middleware/rateLimit.js';
import {
  listAdoptions,
  listingsQuerySchema,
  getAdoption,
  createListing,
  createListingSchema,
  updateListing,
  updateListingSchema,
  applyForAdoption,
  applySchema,
  listApplications,
  myListings,
  reviewApplication,
  reviewApplicationSchema,
} from '../controllers/adoptionController.js';

const router = Router();

// The organisation's own application inbox. Declared before /:id so "applications"
// is not swallowed as a listing id.
router.get('/mine', requireAuth, requireRole('ngo', 'helper'), myListings);
router.get('/applications', requireAuth, requireRole('ngo', 'helper', 'admin'), listApplications);
router.post(
  '/applications/:id/review',
  requireAuth,
  requireRole('ngo', 'helper', 'admin'),
  validate(reviewApplicationSchema),
  reviewApplication
);

// Public
router.get('/', validate(listingsQuerySchema, 'query'), listAdoptions);
router.get('/:id', getAdoption);
// Adopting is a public act — an adopter should not need an account to enquire.
router.post('/:id/apply', formLimiter, validate(applySchema), applyForAdoption);

// Approved organisations only
router.post('/', requireAuth, requireRole('ngo', 'helper'), validate(createListingSchema), createListing);
router.patch('/:id', requireAuth, requireRole('ngo', 'helper', 'admin'), validate(updateListingSchema), updateListing);

export default router;
