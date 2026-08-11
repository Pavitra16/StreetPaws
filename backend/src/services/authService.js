import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env, isProd } from '../config/env.js';

const ROUNDS = 12;
export const TOKEN_COOKIE = 'sp_session';
const TOKEN_TTL = '7d';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!hash) {
    // An account with no password must still cost the same to check, or the
    // timing difference tells an attacker which emails exist.
    await bcrypt.compare(plain, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    return false;
  }
  return bcrypt.compare(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id ?? user._id.toString(),
      role: user.role,
      orgId: user.organizationId ? String(user.organizationId) : null,
    },
    env.auth.jwtSecret,
    { expiresIn: TOKEN_TTL }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.auth.jwtSecret);
  } catch {
    return null;
  }
}

/**
 * httpOnly so page scripts cannot read it; sameSite lax so it survives normal
 * navigation but is not sent on cross-site POSTs.
 */
export function setSessionCookie(res, token) {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: TOKEN_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(TOKEN_COOKIE, { path: '/', httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax' });
}

export const RESET_TOKEN_TTL_MINUTES = 60;

/**
 * Mints a password-reset token.
 *
 * Returns the raw token (emailed, never stored) and its hash (stored, never
 * emailed). A database dump therefore contains nothing that can reset an account.
 */
export function createResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
  };
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * True when a session token was issued before the account's password last
 * changed — i.e. it belongs to a session that should no longer exist.
 * `iat` is in seconds; passwordChangedAt is a Date.
 */
export function tokenPredatesPasswordChange(payload, passwordChangedAt) {
  if (!passwordChangedAt || !payload?.iat) return false;
  // One second of slack: the token is signed and the timestamp written in the
  // same request, and rounding to whole seconds can invert their order.
  return payload.iat * 1000 < passwordChangedAt.getTime() - 1000;
}

/** Readable temporary password for admin-issued accounts. */
export function generateTempPassword() {
  const words = ['tiger', 'mango', 'river', 'stone', 'cloud', 'ember', 'coral', 'delta'];
  const word = words[crypto.randomInt(words.length)];
  const digits = String(crypto.randomInt(1000, 9999));
  return `${word}-${digits}-${crypto.randomBytes(2).toString('hex')}`;
}
