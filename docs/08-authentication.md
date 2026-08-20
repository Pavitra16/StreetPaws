# 08 — Authentication and roles

**Backend:** [`services/authService.js`](../backend/src/services/authService.js),
[`controllers/authController.js`](../backend/src/controllers/authController.js),
[`middleware/auth.js`](../backend/src/middleware/auth.js)
**Frontend:** [`lib/auth.jsx`](../frontend/src/lib/auth.jsx),
[`components/common/ProtectedRoute.jsx`](../frontend/src/components/common/ProtectedRoute.jsx)

---

## There is no public sign-up

Accounts are **created by an admin approving an application** — see
[05](05-organisations-and-admin.md). The only self-service auth actions are
signing in, changing your own password, and resetting a forgotten one.

Reporting a dog, searching, and applying to adopt all work signed out.

---

## Roles

| Role | Gets | Console |
|---|---|---|
| `reporter` | default; nothing beyond public access | — |
| `ngo` | alerts, cases, listings, enquiries | `/rescuer` |
| `helper` | same as `ngo` | `/rescuer` |
| `admin` | applications, organisations, disbursements | `/admin` |

`ngo` and `helper` are separate roles but identical in permissions — the
distinction is `Organization.kind`, kept because they are described differently
throughout the UI.

---

## Signing in — `POST /api/auth/login`

```json
{ "email": "contact@example.org", "password": "…" }
```

```js
const user = await User.findOne({ email }).select('+passwordHash');
const ok = await verifyPassword(password, user?.passwordHash);
if (!user || !ok) throw ApiError.unauthorized('Email or password is incorrect');
```

Two details:

**`verifyPassword` runs a bcrypt comparison even when no user was found**, against
a dummy hash. Returning early would make a non-existent email measurably faster
than a wrong password, which is how account enumeration works.

**One message for both failures.** "No such account" tells an attacker which
addresses are registered.

Response sets the cookie and returns the user:

```json
{ "user": { "id": "…", "name": "…", "email": "…", "role": "ngo",
            "organizationId": "…", "active": true,
            "mustChangePassword": false, "lastLoginAt": "…" },
  "mustChangePassword": false }
```

The organisation is **looked up but not returned**. The lookup is a gate, not a
payload: an organisation approved last month can be suspended today, and its
users have to lose access with it.

```js
if (user.organizationId) {
  const org = await Organization.findById(user.organizationId);
  if (!org || org.applicationStatus !== 'approved') {
    throw new ApiError(403, 'Your organisation is not currently approved');
  }
}
```

The console fetches organisation details separately, so nothing depends on them
riding along here.

`passwordHash`, `passwordResetTokenHash` and `passwordResetExpiresAt` are all
`select: false`, and `User.toJSON` deletes them — two layers, because one query
that forgets `.select()` should not leak a hash.

---

## The session cookie

```js
res.cookie(TOKEN_COOKIE, token, {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: TOKEN_TTL_MS,
  path: '/',
});
```

**`httpOnly`** — JavaScript cannot read it, so an XSS bug cannot steal the
session. This is why the token is not in `localStorage`.

**`sameSite: 'none'` + `secure` in production** — the frontend and API are on
different hosts once deployed (Vercel and Render), which makes every API call
cross-site. `lax` would drop the cookie entirely. `none` requires `secure`, which
requires HTTPS — fine in production, impossible on `http://localhost`, hence the
environment split.

In development the Vite proxy makes `/api` same-origin, so `lax` works and there
is no CORS to debug.

---

## Two ways a session dies before it expires

Checked in `attachUser` on every request:

```js
if (!user.active) return next();                        // deactivated
if (tokenPredatesPasswordChange(payload, user)) return next();
```

A JWT is valid until it expires, so without the second check a token issued
before a password change would keep working — exactly the token you want dead
after "someone has my password". Comparing the token's `iat` against
`user.passwordChangedAt` makes the revocation immediate, at the cost of one
indexed lookup per request.

---

## Password reset

```
POST /api/auth/forgot-password   { email }
POST /api/auth/reset-password    { token, password }
```

**The response to `forgot-password` is identical whether or not the email
exists.** Anything else is an account-enumeration oracle.

The token is generated with `crypto.randomBytes`, **emailed in the clear and
stored only as a SHA-256 hash** with a 60-minute expiry. A database dump
therefore contains nothing that can reset an account — the same reasoning as
password hashing.

On success: the hash is set, `passwordChangedAt` is stamped (killing every
existing session), and the reset token is cleared so the link cannot be reused.

**There is no admin-side password reissue.** Once issued, the password belongs
to the organisation. An admin who can reset any account's password can enter any
account.

---

## Frontend

`AuthProvider` calls `GET /api/auth/me` once on mount. The cookie is sent
automatically because axios is configured with `withCredentials: true`.

`ProtectedRoute` takes an optional `roles` array, redirects to `/login`, and
remembers where you were going.

```jsx
<ProtectedRoute roles={['ngo', 'helper']}><RescuerLayout /></ProtectedRoute>
<ProtectedRoute roles={['admin']}><AdminLayout /></ProtectedRoute>
```

After login, `landingFor(role, from)` decides where you land. It ignores a stale
`from` that the role cannot access — otherwise a rescuer signing in after being
bounced from `/admin` would be sent straight back to `/admin`.

`mustChangePassword` forces a redirect to `/account/password`, which is how a
temporary password issued at approval gets replaced.

---

## Rate limiting

[`middleware/rateLimit.js`](../backend/src/middleware/rateLimit.js)

| Limiter | Window | Production limit |
|---|---|---|
| `loginLimiter` | 15 min | 10, **skipping successful requests** |
| `reportLimiter` | 1 hour | 20 |
| `formLimiter` | 1 hour | 15 |
| `matchLimiter` | 1 hour | 30 |
| `uploadLimiter` | 1 hour | 60 |

`skipSuccessfulRequests` on login means the counter only advances on failures, so
someone signing in repeatedly from an office is never locked out while a
brute-force attempt still is.

All of these depend on `app.set('trust proxy', 1)` in production — behind a host
like Render every client otherwise shares the proxy's IP, and one visitor would
exhaust the limit for everyone.
