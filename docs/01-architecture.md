# 01 — Architecture

## Folder map

```
backend/src/
  server.js          boot: env check → DB → indexes → recover jobs → listen
  app.js             the Express app: middleware order, route mounting

  config/
    env.js           every process.env read, in one place. featureStatus()
    db.js            Mongoose connection
    indexes.js       ensureIndexes() — creates indexes explicitly at startup
    cloudinary.js    signed uploads, URL builders (THUMB / DISPLAY / ANALYSIS)
    razorpay.js      order creation, checkout + webhook signatures
    stripe.js        Checkout Sessions, webhook verification

  middleware/
    auth.js          attachUser, requireAuth, requireRole, requireOrgMember
    validate.js      runs a Zod schema against body or query
    rateLimit.js     five limiters, different windows per endpoint
    errorHandler.js  ApiError, asyncHandler, Mongoose error → HTTP mapping

  models/            eight Mongoose schemas (see 02-data-model.md)
  routes/            URL → middleware → controller. No logic.
  controllers/       request/response. Validation schemas live beside handlers.
  services/          the actual work — reusable, no req/res
  jobs/
    analyzeReport.js in-process queue: AI analysis + embedding + fan-out
  utils/
    geo.js           toPoint, fromPoint, haversineKm, withinRadius
    serialize.js     document → API shape. Contact masking lives here.

frontend/src/
  App.jsx            three route trees: public, /rescuer, /admin (lazy-loaded)
  lib/api.js         axios instance, error normalisation
  lib/auth.jsx       AuthProvider / useAuth
  pages/             one file per screen
  components/        map/, upload/, dog/, ai/, admin/, rescuer/, home/, common/
  hooks/             useGeolocation, useCloudinaryUpload, useReveal
```

## What a request passes through

Defined in [`app.js`](../backend/src/app.js), in this order:

```
1. trust proxy          production only, set to 1
2. helmet               security headers
3. compression          gzip
4. cors                 origin: CLIENT_ORIGIN, credentials: true
5. express.json         1mb limit + raw-body capture for the two webhooks
6. cookieParser         reads the session cookie
7. morgan               request logging
8. attachUser           decodes the JWT, loads the user, sets req.user
9. → route → validate → [requireAuth/requireRole] → controller
10. notFoundHandler     404 for unmatched
11. errorHandler        everything thrown lands here
```

### Order matters in two places

**`express.json` before `cookieParser`, and the raw-body hook inside it.**
Payment webhooks are signed over the exact bytes received. Re-serialising parsed
JSON changes key order and whitespace, so the HMAC would never match. The
`verify` callback keeps the raw buffer on `req.rawBody` for
`/api/donations/webhook` and `/api/donations/stripe/webhook` only.

**`attachUser` before every route, `requireAuth` only on some.** `attachUser`
never rejects — it just populates `req.user` when a valid cookie is present.
That lets a single endpoint behave differently for anonymous and signed-in
callers (a report page shows a masked phone number to the public and the real
one to a verified rescuer) without duplicating the route.

## attachUser, and why it hits the database

```js
// middleware/auth.js
const payload = verifyToken(req.cookies[TOKEN_COOKIE]);
const user = await User.findById(payload.sub);
if (!user?.active) return next();                     // deactivated → anonymous
if (tokenPredatesPasswordChange(payload, user)) return next();
req.user = user;
```

A JWT is valid until it expires, which means a token issued before a password
change would still work — exactly the token you want dead after "someone has my
password". Checking `passwordChangedAt` and `active` on each request costs one
indexed lookup and makes both revocations immediate.

## The background job queue

[`jobs/analyzeReport.js`](../backend/src/jobs/analyzeReport.js) is a small
in-process queue: an array, a concurrency limit, and retry with backoff.

```
queueAnalysis(reportId)  →  [ ...queue ]  →  up to MAX_CONCURRENT workers
```

Deliberately not BullMQ or Redis. At this volume a queue is an array, and the
work is isolated behind one function so swapping the implementation touches one
file. What it does per job:

1. Load the report, mark `analysisState: 'processing'`
2. Ask Gemini for breed, colours, marks, injuries, urgency (falls back to Ollama)
3. Generate a CLIP embedding from the primary photo
4. Recompute `effectiveUrgency`
5. **Fan out to rescuers** — and this happens on every exit path, including
   no API key, no usable photo, and an outright exception

Because the queue is in memory, a restart mid-analysis would leave a report stuck
on `processing` forever. `recoverOrphanedJobs()` runs at boot and re-queues them.

## Error handling

Controllers are wrapped in `asyncHandler`, so a rejected promise reaches
`errorHandler` instead of hanging the request. The handler maps:

| Thrown | HTTP | Body |
|---|---|---|
| `ApiError.badRequest(msg)` | 400 | `{ error: { message } }` |
| Mongoose `ValidationError` | 400 | `{ error: { message, details: { field: msg } } }` |
| `CastError` (bad ObjectId) | 400 | `Invalid value for "id"` |
| duplicate key (11000) | 409 | `Duplicate value` + `keyValue` |
| anything else | 500 | logged server-side, generic message out |

Stack traces are included below 500 in development and never in production.

The frontend's axios interceptor ([`lib/api.js`](../frontend/src/lib/api.js))
turns that shape into `error.message` and `error.details`, and folds field
errors into the message so a form showing only `error.message` still says
something useful.
