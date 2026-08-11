import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import {
  createDonationOrder,
  createOrderSchema,
  verifyDonation,
  verifySchema,
  donationWebhook,
  fundSummary,
  recordDisbursement,
  disbursementSchema,
} from '../controllers/donationController.js';

const router = Router();

// req.rawBody is captured by the express.json `verify` hook in app.js — see the
// comment there for why the parsed body cannot be used for signature checking.
router.post('/webhook', donationWebhook);

router.get('/fund', fundSummary);
router.post('/order', validate(createOrderSchema), createDonationOrder);
router.post('/verify', validate(verifySchema), verifyDonation);
router.post('/disburse', requireRole('admin'), validate(disbursementSchema), recordDisbursement);

export default router;
