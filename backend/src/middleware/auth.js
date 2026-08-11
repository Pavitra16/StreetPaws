import { User } from '../models/index.js';
import { TOKEN_COOKIE, verifyToken, tokenPredatesPasswordChange } from '../services/authService.js';
import { ApiError } from './errorHandler.js';

/**
 * Reads the session cookie and attaches req.user when it is valid.
 * Never rejects — routes decide what they require. Reporting a dog stays
 * anonymous, so most of the app runs with req.user === null.
 */
export async function attachUser(req, res, next) {
  req.user = null;

  const token = req.cookies?.[TOKEN_COOKIE];
  if (!token) return next();

  const payload = verifyToken(token);
  if (!payload?.sub) return next();

  try {
    const user = await User.findById(payload.sub);
    // A deactivated account must lose access immediately, not when its token
    // happens to expire — so the database is checked, not just the JWT claims.
    // A password change also invalidates every session issued before it.
    if (user?.active && !tokenPredatesPasswordChange(payload, user.passwordChangedAt)) {
      req.user = user;
    }
  } catch {
    // A malformed id in a token is not worth failing the request over.
  }

  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(new ApiError(401, 'You need to sign in to do this'));
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'You need to sign in to do this'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'Your account does not have access to this'));
    }
    next();
  };
}

/**
 * Confirms the signed-in user actually belongs to the organisation in the URL.
 * Without this, any signed-in rescuer could read another organisation's queue —
 * which includes reporter phone numbers.
 */
export function requireOrgMember(paramName = 'id') {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'You need to sign in to do this'));
    if (req.user.role === 'admin') return next();

    const target = req.params[paramName];
    if (!req.user.organizationId || String(req.user.organizationId) !== String(target)) {
      return next(new ApiError(403, 'This is not your organisation'));
    }
    next();
  };
}

/**
 * Reporter contact details are only revealed to a verified organisation working
 * the case, or an admin. Everyone else — including the public and unverified
 * organisations — sees the masked view.
 */
export function canViewContact(req, { organization } = {}) {
  const user = req.user;
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!organization) return false;
  return (
    organization.verified &&
    String(user.organizationId ?? '') === String(organization._id ?? organization.id ?? '')
  );
}

/**
 * Loads the caller's organisation once per request and caches it on req.
 *
 * Without this, controllers called canViewContact(req) with no organisation, so
 * it always returned false for a rescuer — meaning a verified NGO could see a
 * reporter's number in their own queue but NOT on the report page they clicked
 * through to. Same user, same report, two different answers.
 */
export async function loadViewerOrganization(req) {
  if (req._viewerOrg !== undefined) return req._viewerOrg;

  if (!req.user?.organizationId) {
    req._viewerOrg = null;
    return null;
  }

  const { Organization } = await import('../models/index.js');
  req._viewerOrg = await Organization.findById(req.user.organizationId).catch(() => null);
  return req._viewerOrg;
}

/**
 * The check to use inside controllers: resolves the viewer's organisation, then
 * applies the same rule everywhere.
 */
export async function viewerCanSeeContact(req) {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  const organization = await loadViewerOrganization(req);
  return canViewContact(req, { organization });
}
