# 09 — API reference

Base path `/api`. JSON in, JSON out. Auth is a `httpOnly` cookie set at login.

**Auth column:** — public · 🔒 signed in · 🔑 manage token · **role** required ·
**own** = must belong to the organisation in the URL.

---

## Reports

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/reports` | — | Create a found/lost report. Triggers analysis + fan-out. |
| GET | `/reports/:id` | — | One report. Contact revealed to a verified org. |
| PATCH | `/reports/:id/status` | 🔒 | Move a case along |
| GET | `/reports/:id/sightings` | — | The sighting trail for a lost dog |
| POST | `/reports/:id/sightings` | — | Log a sighting. Lost reports only |
| GET | `/reports/:id/manage` | 🔑 | The owner's view of their own report |
| PATCH | `/reports/:id/manage` | 🔑 | Edit description, name, breed, location, phone visibility |
| POST | `/reports/:id/manage/resolve` | 🔑 | `reunited` or `closed`. Retires the link |

🔑 = the manage token from the emailed link, not a session. See
[11](11-access-model.md#the-manage-link).

<details><summary><code>POST /reports</code></summary>

```json
{ "kind": "found|lost",
  "media": [{ "cloudinaryPublicId": "…", "url": "…", "thumbnailUrl": "…",
              "resourceType": "image|video", "isPrimary": true }],
  "lat": 28.5677, "lng": 77.2433,
  "address": "…", "city": "…", "state": "…", "pincode": "…",
  "condition": "healthy|injured|sick|critical",
  "description": "…", "dogName": "…", "breedGuess": "…",
  "occurredAt": "2026-08-12T10:00:00Z",
  "contact": { "name": "…", "phone": "…", "email": "…" } }
```

`media` min 1, max 8. `contact.name` and `contact.phone` required.
`contact.showPublicly` publishes the number on the page — honoured only when
`kind` is `lost`, and ignored on a found report.
**201** → the serialized report, contact unmasked (you just wrote it).
</details>

<details><summary><code>POST /reports/:id/sightings</code></summary>

```json
{ "lat": 28.5301, "lng": 77.2101, "address": "…", "city": "…",
  "seenAt": "2026-08-13T14:00:00Z", "note": "…",
  "media": [{ "cloudinaryPublicId": "…", "url": "…" }],
  "contact": { "name": "…", "phone": "…", "email": "…" } }
```

Only `lat`/`lng` required. **400** unless the report is `kind: 'lost'`. The
response reduces `contact` to `{ name, hasContactDetails }` — a sighting
reporter's number is never returned to anyone. See
[10](10-lost-dog-flow.md#everything-except-the-pin-is-optional).
</details>

---

## Search & matching

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/search/near` | — | Reports by area, breed, condition, urgency, date |
| POST | `/search/match` | — | Rank reports against a photo or an existing report |

<details><summary><code>GET /search/near</code></summary>

`lat` `lng` required · `radiusKm` 0.5–200 (15) · `kind` · `condition` · `breed` ·
`status` (comma separated) · `minUrgency` 1–5 · `from` `to` · `sort`
`distance|recent|urgency` · `page` · `limit`

A `breed` search also returns reports with no breed recorded, ranked below
confirmed matches. Every result carries `breedConfirmed`.
</details>

<details><summary><code>POST /search/match</code></summary>

```json
{ "reportId": "24-char id",   // or "imageUrl": "https://…"
  "lat": 28.55, "lng": 77.20, "lostAt": "2026-08-05",
  "breed": "Beagle", "kind": "found", "limit": 20 }
```

Returns results with `matchScore` (0–1), `matchBreakdown`
(`visual`/`attributes` may be `null` = not compared), `distanceKm`, and `meta`
with `retrieval: "vector_search"|"in_memory_scan"`.
</details>

---

## Uploads

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/uploads/signature` | — | Signed Cloudinary params |

Public on purpose: reporting is anonymous and a report needs a photo. Held by
`uploadLimiter` and a signature scoped to one folder and a fixed format list.

Returns `{ signature, timestamp, folder, allowedFormats, apiKey, cloudName, limits }`.

---

## Organisations

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/organizations` | — | Apply. Creates a pending record, no account. |
| GET | `/organizations/near` | — | Approved organisations near a point |
| GET | `/organizations/:id` | — | One organisation (pending ones are hidden) |
| GET | `/organizations/:id/queue` | 🔒 **own** | Alert queue, worst first |
| POST | `/organizations/:id/alerts/:alertId/respond` | 🔒 **own** | `accept` / `decline` / `view` |
| POST | `/organizations/:id/reports/:reportId/resolve` | 🔒 **own** | Update case status |

<details><summary><code>POST /organizations</code></summary>

```json
{ "name": "…", "kind": "ngo|private_helper",
  "lat": 0, "lng": 0, "address": "…", "city": "…", "state": "…",
  "serviceRadiusKm": 10, "capacity": 5,
  "phone": "…", "email": "…", "website": "…",
  "specializations": ["injury","surgery","skin_disease","puppies",
                      "sterilization","rabies","shelter","transport"],
  "pan": "AACTP4821K",
  "registrationNumber": "…", "darpanId": "…",
  "contactPersonName": "…", "yearsActive": 11 }
```

`pan` **required for both kinds**. **409** if a live application already exists
with that email, PAN or phone.
</details>

---

## Adoption

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/adoptions` | — | Browse available dogs |
| GET | `/adoptions/:id` | — | One listing |
| POST | `/adoptions/:id/apply` | — | Apply to adopt |
| POST | `/adoptions` | 🔒 **ngo/helper** | Create a listing |
| PATCH | `/adoptions/:id` | 🔒 **ngo/helper/admin** | Change status |
| GET | `/adoptions/mine` | 🔒 **ngo/helper** | Your listings |
| GET | `/adoptions/applications` | 🔒 **ngo/helper/admin** | Enquiries |
| POST | `/adoptions/applications/:id/review` | 🔒 **ngo/helper/admin** | Decide |

---

## Donations

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/donations/fund` | — | Public ledger |
| GET | `/donations/:id` | — | Status only — no donor details |
| POST | `/donations/order` | — | Start a donation |
| POST | `/donations/verify` | — | Razorpay checkout callback |
| POST | `/donations/webhook` | — | Razorpay, signature-verified |
| POST | `/donations/stripe/webhook` | — | Stripe, signature-verified |
| POST | `/donations/disburse` | 🔒 **admin** | Pay out from the fund |

<details><summary><code>POST /donations/order</code></summary>

```json
{ "amountInr": 500,
  "target": { "type": "platform_fund|organization|dog",
              "organizationId": "…", "dogReportId": "…" },
  "donor": { "name": "…", "email": "…", "phone": "…", "anonymous": false },
  "message": "…" }
```

Minimum ₹10. Response depends on the active provider:

```json
{ "provider": "razorpay", "donationId": "…", "orderId": "…", "keyId": "rzp_test_…" }
{ "provider": "stripe",   "donationId": "…", "checkoutUrl": "https://checkout.stripe.com/…" }
{ "provider": "demo",     "donationId": "…", "demo": true, "status": "paid" }
```
</details>

---

## Auth

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/login` | — | Sets the session cookie |
| POST | `/auth/logout` | — | Clears it |
| GET | `/auth/me` | — | Current user, or `null` |
| POST | `/auth/change-password` | 🔒 | Change your own |
| POST | `/auth/forgot-password` | — | Always the same response |
| POST | `/auth/reset-password` | — | `{ token, password }` |

---

## Admin

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/admin/stats` | 🔒 **admin** | Counts for the overview |
| GET | `/admin/organizations` | 🔒 **admin** | Filter by `status`, `kind` |
| GET | `/admin/organizations/:id/detail` | 🔒 **admin** | Performance, money, cases |
| POST | `/admin/organizations/:id/review` | 🔒 **admin** | `approve` / `reject` / `suspend` |

Approving returns the generated credentials **once**, plus `emailed: true|false`
and a reason.

---

## Health

`GET /api/health` — unauthenticated.

```json
{ "ok": true, "env": "development", "db": "connected",
  "features": { "cloudinary": true, "gemini": true, "razorpay": false,
                "stripe": false, "email": true, "ollama": false },
  "paymentProvider": "demo",
  "time": "2026-08-12T17:39:37.809Z" }
```

The quickest way to find out why a feature is not working.

---

## Errors

```json
{ "error": { "message": "Validation failed",
             "details": { "pan": "Enter a valid 10-character PAN" } } }
```

| Code | Meaning |
|---|---|
| 400 | Validation failed, or a bad ObjectId |
| 401 | Not signed in |
| 403 | Signed in, wrong role or another organisation's data |
| 404 | Not found — also returned for records you may not see |
| 409 | Conflict: duplicate applicant, or a case someone else already took |
| 429 | Rate limited |
| 503 | A feature is not configured on this server |
