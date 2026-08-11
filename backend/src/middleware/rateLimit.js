import rateLimit from 'express-rate-limit';
import { isProd } from '../config/env.js';

/**
 * Rate limits on the public write endpoints.
 *
 * Without these, three things are open to anyone:
 *   - unlimited password guessing on /auth/login
 *   - unlimited report creation, each of which costs a Gemini vision call and a
 *     CLIP embedding, so a script can burn the whole free-tier quota
 *   - unlimited applications and adoption enquiries landing in an admin queue
 *
 * Limits are generous — a genuine user reporting several dogs in one afternoon
 * must never hit one.
 */

const common = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // A generous ceiling in development would hide the fact that limiting exists
  // at all, so keep it on everywhere and just relax the numbers locally.
  skip: () => false,
};

function message(text) {
  return { error: { message: text } };
}

/** Login: the one endpoint where an attacker gains from sheer volume. */
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: isProd ? 10 : 50,
  // Count only failures, so someone legitimately signing in and out repeatedly
  // is never locked out.
  skipSuccessfulRequests: true,
  message: message('Too many sign-in attempts. Wait 15 minutes and try again.'),
});

/** Report creation — each one costs an AI call, so this protects the quota too. */
export const reportLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: isProd ? 20 : 200,
  message: message(
    'You have submitted a lot of reports in a short time. Please wait a while before submitting more.'
  ),
});

/** Applications and adoption enquiries — these land in a human's queue. */
export const formLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: isProd ? 10 : 100,
  message: message('Too many submissions from this address. Please try again later.'),
});

/** Photo matching — runs a CLIP embedding and possibly a vision call per request. */
export const matchLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: isProd ? 30 : 300,
  message: message('Too many searches. Please wait a few minutes.'),
});

/** Signed upload tokens — each one is permission to write to our Cloudinary account. */
export const uploadLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: isProd ? 60 : 600,
  message: message('Too many uploads. Please wait a while.'),
});
