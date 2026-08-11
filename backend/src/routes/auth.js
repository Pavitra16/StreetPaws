import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import {
  login,
  loginSchema,
  logout,
  me,
  changePassword,
  changePasswordSchema,
  forgotPassword,
  forgotPasswordSchema,
  resetPassword,
  resetPasswordSchema,
} from '../controllers/authController.js';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.get('/me', me);
router.post('/change-password', requireAuth, validate(changePasswordSchema), changePassword);

// Both rate-limited: one is an account-discovery vector, the other is a
// brute-force target against a 64-character token.
router.post('/forgot-password', loginLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', loginLimiter, validate(resetPasswordSchema), resetPassword);

export default router;
