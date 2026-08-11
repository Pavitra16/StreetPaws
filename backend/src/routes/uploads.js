import { Router } from 'express';
import { createUploadSignature } from '../controllers/uploadController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';

const router = Router();

// requireAuth is a pass-through stub today; wiring it now means enabling auth
// later does not require finding every write route again.
router.post('/signature', uploadLimiter, requireAuth, createUploadSignature);

export default router;
