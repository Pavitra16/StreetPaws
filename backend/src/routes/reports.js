import { Router } from 'express';
import { getReport } from '../controllers/searchController.js';
import {
  createReport,
  createReportSchema,
  updateReportStatus,
  updateStatusSchema,
} from '../controllers/reportController.js';
import {
  createSighting,
  createSightingSchema,
  listSightings,
} from '../controllers/sightingController.js';
import {
  getManagedReport,
  editManagedReport,
  editManagedReportSchema,
  resolveManagedReport,
  resolveManagedReportSchema,
} from '../controllers/reportManageController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { reportLimiter, formLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', reportLimiter, validate(createReportSchema), createReport);
router.get('/:id', getReport);
router.patch('/:id/status', requireAuth, validate(updateStatusSchema), updateReportStatus);

// Public, like reporting itself: whoever spots the dog is a passer-by with no
// account, and requiring one loses the sighting.
router.get('/:id/sightings', listSightings);
router.post('/:id/sightings', formLimiter, validate(createSightingSchema), createSighting);

/**
 * Owner self-service, authorised by the emailed manage token rather than a
 * session. No requireAuth: the whole point is that filing a report never made
 * an account, so there is no session to require.
 */
// Rate-limited like the mutations: a 64-hex token is not guessable, but an
// unthrottled endpoint that answers "is this token valid" should not be free.
router.get('/:id/manage', formLimiter, getManagedReport);
router.patch('/:id/manage', formLimiter, validate(editManagedReportSchema), editManagedReport);
router.post(
  '/:id/manage/resolve',
  formLimiter,
  validate(resolveManagedReportSchema),
  resolveManagedReport
);

export default router;
