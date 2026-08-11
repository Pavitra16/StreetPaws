import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { matchLimiter } from '../middleware/rateLimit.js';
import { searchNear, nearQuerySchema } from '../controllers/searchController.js';
import { matchReports, matchSchema } from '../controllers/matchController.js';

const router = Router();

router.get('/near', validate(nearQuerySchema, 'query'), searchNear);
router.post('/match', matchLimiter, validate(matchSchema), matchReports);

export default router;
