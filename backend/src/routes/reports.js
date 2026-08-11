import { Router } from 'express';
import { getReport } from '../controllers/searchController.js';
import {
  createReport,
  createReportSchema,
  updateReportStatus,
  updateStatusSchema,
} from '../controllers/reportController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { reportLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', reportLimiter, validate(createReportSchema), createReport);
router.get('/:id', getReport);
router.patch('/:id/status', requireAuth, validate(updateStatusSchema), updateReportStatus);

export default router;
