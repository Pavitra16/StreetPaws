import crypto from 'node:crypto';

/**
 * Scoped, account-free ownership of a single report.
 *
 * The same shape as the password-reset token in authService: the raw token is
 * emailed and never stored, only its SHA-256 hash is kept, so a database dump
 * contains nothing anyone can click.
 *
 * What differs, deliberately:
 *
 * - **No expiry.** A reset token lives 60 minutes because it is used within
 *   seconds of being asked for. A dog can be missing for weeks, and a link that
 *   dies mid-search is worse than useless — it strands the one person who can
 *   close the report. Revocation replaces expiry: the token is retired when the
 *   report is closed or the owner asks for a new link.
 *
 * - **It authorises one report, not a session.** It cannot sign in, cannot read
 *   another report, and cannot reach anything under /rescuer or /admin. Whoever
 *   holds the link — including anyone the owner forwards the email to — can act
 *   only on this one dog. That narrow blast radius is what makes a long-lived,
 *   inbox-resident token an acceptable trade for zero friction.
 */
export function createManageToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashManageToken(token), issuedAt: new Date() };
}

export function hashManageToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Constant-time comparison of a presented token against the stored hash.
 *
 * A plain === on the hashes leaks, through timing, how many leading characters
 * were correct — enough to walk a token out of the server one byte at a time.
 */
export function manageTokenMatches(presented, storedHash) {
  if (typeof presented !== 'string' || typeof storedHash !== 'string') return false;

  const a = Buffer.from(hashManageToken(presented));
  const b = Buffer.from(storedHash);
  // Both are SHA-256 hex, so lengths always match; the guard is for a truncated
  // or corrupted stored value, where timingSafeEqual would throw.
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

/** The manage link that goes in the email. */
export function buildManageUrl({ appUrl, reportId, token }) {
  return `${appUrl}/reports/${reportId}/manage?token=${token}`;
}
