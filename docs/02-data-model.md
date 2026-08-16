# 02 — Data model

Field-by-field schema, every index and the reasoning behind each one lives in
**[`../DATABASE.md`](../DATABASE.md)**. This page is about how the eight
collections fit together and which ones you touch for a given feature.

```
User ──owns──> Organization ──posts──> AdoptionListing ──> AdoptionApplication
                    │  ▲                      ▲
              alerted│  │assigned             │ sourceReportId
                    ▼  │                      │
                  Alert └───── DogReport ─────┘
                                 ▲   ▲
                  Sighting ──────┘   └────── Donation (target.dogReportId)
                 (lost dogs only)
                    Donation ──> Organization (target.organizationId)
                 Disbursement ──> Organization
```

Nine collections. `Sighting` is the newest and the only one that deliberately
does *not* reuse `DogReport` — see
[10](10-lost-dog-flow.md#why-sighting-is-its-own-collection).

## Which collections a feature touches

| Feature | Writes | Reads |
|---|---|---|
| Report a dog | `DogReport`, then `Alert` | `Organization` |
| Log a sighting | `Sighting` | `DogReport` |
| Find by area/breed | — | `DogReport` |
| Find by photo | — | `DogReport` (incl. `embedding`) |
| Apply as an organisation | `Organization` | `Organization` (duplicate check) |
| Admin approves | `Organization`, `User` | — |
| Rescuer accepts a case | `Alert`, `DogReport`, `Organization` | — |
| Adoption listing | `AdoptionListing` | `Organization` |
| Adoption application | `AdoptionApplication` | `AdoptionListing` |
| Donation | `Donation` | `Organization`, `DogReport` |
| Fund payout | `Disbursement` | `Donation` |

## Four decisions that shaped it

### One collection for lost and found

`DogReport.kind` is `'found' | 'lost'`. Matching a lost dog against found reports
is then a query within a single index rather than a join across two collections.

### Location is GeoJSON everywhere

```js
location: { type: 'Point', coordinates: [lng, lat], address, city, state, pincode }
```

`[lng, lat]` — the opposite order to how people say it, and the single most
common source of "why is this dog in the sea". Every conversion goes through
`utils/geo.js` so the trap exists in one file. `Organization`, `DogReport` and
`AdoptionListing` all carry it, all with `2dsphere` indexes.

### Derived numbers are computed, not stored — except where they must be

`effectiveUrgency` **is** stored, because MongoDB cannot index a virtual and the
whole triage queue sorts on it. It is recomputed by a `pre('save')` hook, never
written by hand.

`responseStats` is a denormalised cache on `Organization`, and the `Alert` rows
are the truth. An earlier seed wrote those statistics as literals and the admin
panel displayed acceptance rates of **378%** and **533%** — the current seed
counts them from the rows at the end of the run.

### Money is integers

`amountPaise` on `Donation` and `Disbursement`. Never floats. See
[07](07-donations.md#money-is-stored-as-integers).

## Indexes that are load-bearing

| Index | Without it |
|---|---|
| `dogreports.{location: 2dsphere}` | `$geoNear` errors outright — routing and search both fail |
| `dogreports.{status, effectiveUrgency:-1, createdAt:-1}` | the triage queue can't be served in one scan |
| `dogreport_embedding_index` (Atlas Vector Search, 512-dim, cosine) | photo matching falls back to an in-memory scan |
| `alerts.{dogReportId, organizationId}` UNIQUE | a retry double-notifies |
| `organizations.unique_live_{email,pan,phone}` | two concurrent applications both succeed |
| `users.{email}` UNIQUE | duplicate accounts |

All created explicitly by `ensureIndexes()` at startup, not by Mongoose's lazy
`autoIndex` — a geo query issued before the index finished building fails with
*"unable to find index for $geoNear query"*, and that is a race you only lose in
production.

## Seeding

`npm run seed` wipes everything except one admin and rebuilds a coherent dataset:
9 organisations (7 approved, 2 pending), 21 reports, 63 alerts, 7 adoption
listings, 4 applications, and the money ledger.

Nothing hand-written that can be computed — `responseStats` from the `Alert`
rows, `activeCaseCount` from assigned reports, `effectiveUrgency` from the
model's own hook, disbursements capped at what the fund actually received.

Photos come from `backend/seed-assets/` and are uploaded to Cloudinary. Every
precondition is checked **before** a single document is deleted: a seed that
wipes the database and then fails halfway leaves you worse off than not running
it.
