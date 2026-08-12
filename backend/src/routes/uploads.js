import { Router } from 'express';
import { createUploadSignature } from '../controllers/uploadController.js';
import { uploadLimiter } from '../middleware/rateLimit.js';

const router = Router();

/**
 * Deliberately public.
 *
 * The whole point of the product is that someone standing on a street next to
 * an injured dog can photograph it and send it — without an account. Reports
 * are anonymous (POST /api/reports has no auth) and a report is invalid without
 * a photo, so requiring a login here made the primary flow impossible for
 * exactly the people it is built for.
 *
 * What holds the line instead: the rate limiter, and a signature scoped to one
 * folder and a fixed format list, so a captured signature cannot be turned into
 * a general-purpose upload endpoint for the account.
 */
router.post('/signature', uploadLimiter, createUploadSignature);

export default router;
