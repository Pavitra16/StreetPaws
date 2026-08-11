import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import {
  listOrganizations,
  listApplicationsSchema,
  reviewOrganization,
  reviewSchema,
  adminStats,
  organizationDetail,
} from '../controllers/adminController.js';

const router = Router();

// Every route here is admin-only, applied once at the router rather than
// per-route so a new endpoint cannot be added unprotected by accident.
router.use(requireRole('admin'));

router.get('/stats', adminStats);
router.get('/organizations', validate(listApplicationsSchema, 'query'), listOrganizations);
router.get('/organizations/:id/detail', organizationDetail);
router.post('/organizations/:id/review', validate(reviewSchema), reviewOrganization);

export default router;
