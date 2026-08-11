import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireOrgMember } from '../middleware/auth.js';
import { formLimiter } from '../middleware/rateLimit.js';
import {
  applyAsOrganization,
  createOrgSchema,
  organizationsNear,
  orgsNearSchema,
  getOrganization,
  organizationQueue,
  respondToAlert,
  respondSchema,
  updateCaseStatus,
  resolveSchema,
} from '../controllers/organizationController.js';

const router = Router();

// Public: the directory only ever lists approved organisations.
router.get('/near', validate(orgsNearSchema, 'query'), organizationsNear);
router.get('/:id', getOrganization);

// Public application. Creates a 'pending' record — no login, no alerts, no
// visibility — until an admin reviews it.
router.post('/', formLimiter, validate(createOrgSchema), applyAsOrganization);

// Responder surface: signed in AND a member of the organisation in the URL.
router.get('/:id/queue', requireAuth, requireOrgMember('id'), organizationQueue);
router.post(
  '/:id/alerts/:alertId/respond',
  requireAuth,
  requireOrgMember('id'),
  validate(respondSchema),
  respondToAlert
);
router.post(
  '/:id/reports/:reportId/resolve',
  requireAuth,
  requireOrgMember('id'),
  validate(resolveSchema),
  updateCaseStatus
);

export default router;
