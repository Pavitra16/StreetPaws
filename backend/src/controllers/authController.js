import { z } from 'zod';
import { User, Organization } from '../models/index.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  setSessionCookie,
  clearSessionCookie,
  createResetToken,
  hashResetToken,
} from '../services/authService.js';
import { sendPasswordReset } from '../services/emailService.js';
import { env, isProd } from '../config/env.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await verifyPassword(password, user?.passwordHash);

  // One message for "no such user" and "wrong password" — otherwise the login
  // form doubles as a way to enumerate which emails have accounts.
  if (!user || !ok) throw new ApiError(401, 'Email or password is incorrect');
  if (!user.active) throw new ApiError(403, 'This account has been deactivated');

  // An approved organisation can be suspended later; its users lose access too.
  if (user.organizationId) {
    const org = await Organization.findById(user.organizationId);
    if (!org || org.applicationStatus !== 'approved') {
      throw new ApiError(403, 'Your organisation is not currently approved');
    }
  }

  user.lastLoginAt = new Date();
  await user.save();

  setSessionCookie(res, signToken(user));

  res.json({
    user: user.toJSON(),
    mustChangePassword: user.mustChangePassword,
  });
});

/** POST /api/auth/logout */
export const logout = asyncHandler(async (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** GET /api/auth/me — how the frontend restores a session on reload. */
export const me = asyncHandler(async (req, res) => {
  if (!req.user) return res.json({ user: null });

  let organization = null;
  if (req.user.organizationId) {
    organization = await Organization.findById(req.user.organizationId);
  }

  res.json({
    user: req.user.toJSON(),
    organization: organization ? organization.toJSON() : null,
    mustChangePassword: req.user.mustChangePassword,
  });
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(200)
    .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number'),
});

/** POST /api/auth/change-password */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+passwordHash');
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw new ApiError(401, 'Your current password is incorrect');

  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  user.passwordChangedAt = new Date();
  await user.save();

  // Every other session is now invalid; re-issue for the one making the change.
  setSessionCookie(res, signToken(user));
  res.json({ ok: true });
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/**
 * POST /api/auth/forgot-password
 *
 * Always answers the same way, whether or not the address has an account —
 * otherwise this endpoint becomes a way to discover which of your NGOs are
 * registered, one email at a time.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const generic = {
    ok: true,
    message: 'If that email has an account, a reset link is on its way.',
  };

  const user = await User.findOne({ email });
  if (!user || !user.active) return res.json(generic);

  const { token, tokenHash, expiresAt } = createResetToken();
  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpiresAt = expiresAt;
  await user.save();

  const link = `${env.clientOrigin}/reset-password?token=${token}`;
  const sent = await sendPasswordReset(user, link).catch((err) => {
    console.error('[auth] reset email failed:', err.message);
    return { sent: false };
  });

  // Without SMTP the link would be unreachable and the feature untestable, so
  // in development it is logged. Never in production — a reset link in a log
  // file is a way into every account.
  if (!sent?.sent && !isProd) {
    console.log(`[auth] password reset link for ${email}: ${link}`);
    return res.json({ ...generic, devLink: link });
  }

  res.json(generic);
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(200),
  newPassword: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(200)
    .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number'),
});

/** POST /api/auth/reset-password */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  const user = await User.findOne({
    passwordResetTokenHash: hashResetToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) throw ApiError.badRequest('That reset link is invalid or has expired. Request a new one.');
  if (!user.active) throw new ApiError(403, 'This account has been deactivated');

  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  user.passwordChangedAt = new Date();
  // Single use: consumed the moment it works.
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();

  // Deliberately does NOT sign them in. Whoever requested the reset may not be
  // whoever clicked the link; make them prove they know the new password.
  res.json({ ok: true, message: 'Password updated. You can sign in now.' });
});
