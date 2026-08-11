# Database structure

MongoDB, eight collections, defined with Mongoose in [`backend/src/models/`](backend/src/models).

```
User ──owns──> Organization ──posts──> AdoptionListing ──> AdoptionApplication
                    │  ▲                      ▲
              alerted│  │assigned             │sourceReportId
                    ▼  │                      │
                  Alert └───── DogReport ─────┘
                                   ▲
                    Donation ──────┘ (target.dogReportId)
                    Donation ──> Organization (target.organizationId)
                 Disbursement ──> Organization (+ optional DogReport)
```

## Shared sub-document: location

Carried by `Organization`, `DogReport` and `AdoptionListing`; all three have a `2dsphere` index.

```js
location: {
  type: 'Point',
  coordinates: [lng, lat],   // GeoJSON order — NOT lat/lng
  address, city, state, pincode
}
```

This index is what finds nearby helpers. No third-party places API is involved — the helpers we
route to are the ones registered here, and only this database knows about them.

---

## `users`

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `email` | String | required, **UNIQUE** |
| `phone` | String | |
| `role` | Enum | `reporter` · `ngo` · `helper` · `admin` |
| `organizationId` | Ref → Organization | null for plain reporters |
| `passwordHash` | String | `select: false` |
| `passwordResetTokenHash` | String | `select: false` — only the hash is stored |
| `passwordResetExpiresAt` | Date | `select: false` |
| `passwordChangedAt` | Date | any JWT issued before this is rejected |
| `mustChangePassword` | Boolean | set when an admin issues a temporary password |
| `active`, `lastLoginAt` | | |

A custom `toJSON` strips every secret field, so a leak through an unfiltered response is not
possible even if a query forgets to exclude them.

## `organizations`

NGOs and individual rescuers share one collection, separated by `kind`. They behave identically for
routing — both receive alerts, accept cases and list dogs — so splitting them would mean duplicating
every query.

| Field | Type | Notes |
|---|---|---|
| `name`, `description` | String | |
| `kind` | Enum | `ngo` · `private_helper` |
| `location` | Point | **2dsphere** |
| `serviceRadiusKm` | Number | how far they will travel |
| `capacity` / `activeCaseCount` | Number | routing skips them when full |
| `specializations` | [Enum] | `injury` `surgery` `skin_disease` `puppies` `sterilization` `rabies` `shelter` `transport` |
| `applicationStatus` | Enum | `pending` · `approved` · `rejected` · `suspended` |
| `reviewedAt` / `reviewedByUserId` / `reviewNote` | | audit trail for the admin decision |
| `pan` | String | `/^[A-Z]{5}[0-9]{4}[A-Z]$/`, stored uppercase |
| `registrationNumber` | String | free text — state-scoped, so *not* a uniqueness key |
| `darpanId` | String | NITI Aayog portal ID, optional but nationally unique |
| `ownerUserId` | Ref → User | the login account, created on approval |
| `verified` | Boolean | verified ⇒ may see reporter phone numbers |
| `active` | Boolean | |
| `responseStats` | Sub-doc | `{ assigned, accepted, resolved, avgResponseMinutes }` — a denormalised cache; `Alert` rows are the source of truth |

**Approval and verification are separate.** Approval lets an organisation work cases; verification is
what grants access to personal data. `operationalFilter()` — `{ applicationStatus: 'approved', active: true }` —
is the single condition for "may operate on the platform", used by routing, adoption and donations
alike so an unreviewed applicant can never collect money or see a reporter.

### Duplicate-applicant prevention

Three **partial** unique indexes, each scoped to `applicationStatus ∈ {pending, approved}`:

| Index | Key | Also requires |
|---|---|---|
| `unique_live_email` | `email` | |
| `unique_live_pan` | `pan` | `pan` exists and is a string |
| `unique_live_phone` | `phone` | `phone` exists and is a string |

Partial for two reasons. Scoping to live statuses keeps rejected and suspended records as history and
lets a rejected applicant reapply — what must never exist twice is an organisation that can
*currently* receive reports. Scoping on `$exists` stops the many private helpers without a PAN from
all colliding on null.

PAN is the identity key for organisations because no NGO registration number works for the job:
society and trust numbers are issued per state, so two unrelated NGOs in different states can
legitimately hold the same one. Individuals are not asked for a PAN — that is a disproportionate ask
of a volunteer — so their phone number is the key instead.

The application controller checks for duplicates too, but only for a friendly error naming the field.
A check-then-insert has a race: two applications submitted at the same instant both see "no existing
record" and both succeed. Only the database can settle that.

## `dogreports`

The core object. Lost and found reports live together, so matching is a query within a single index
rather than a join.

| Field | Type | Notes |
|---|---|---|
| `kind` | Enum | `found` · `lost` |
| `media` | [Sub-doc] | `{ cloudinaryPublicId, url, thumbnailUrl, resourceType }` |
| `location` | Point | **2dsphere** |
| `contact` | Sub-doc | reporter's name and phone — masked in every list view |
| `condition` | Enum | `healthy` · `injured` · `sick` · `critical` (the reporter's own assessment) |
| `dogName`, `breedGuess`, `description`, `occurredAt` | | |
| `aiAnalysis` | Sub-doc | breed, confidence, colours, marks, injuries, urgency, `isDog`, generated description |
| `analysisState` | Enum | `pending` · `processing` · `done` · `failed` · `skipped` |
| `embedding` | [Number] | 512-dim CLIP vector, `select: false` |
| `effectiveUrgency` | Number | **stored, not virtual** |
| `status` | Enum | `open` · `assigned` · `in_treatment` · `resolved` · `reunited` · `closed` |
| `assignedOrganizationId` | Ref → Organization | |
| `statusHistory` | [Sub-doc] | `{ status, at, note, byOrganizationId }` |
| `matchedReportId` | Ref → DogReport | set when a lost/found pair is confirmed |
| `reporterUserId` | Ref → User | null for anonymous reports |

`effectiveUrgency = max(urgency from condition, urgency from AI)`. It is a stored field rather than a
virtual because Mongo cannot index a virtual, and the whole triage queue sorts on it. Taking the max
means the model can escalate a case but never quietly downgrade a human's judgement.

Indexes: `2dsphere` on location; single-field on `kind`, `status`, `condition`, `analysisState`,
`effectiveUrgency`, `location.city`, `occurredAt`; and two compounds —
`{kind, status, occurredAt:-1}` for browsing and `{status, effectiveUrgency:-1, createdAt:-1}` for
the worst-first triage queue.

An **Atlas Vector Search** index, `dogreport_embedding_index`, covers `embedding`: 512 dimensions,
cosine similarity. Created by `npm run vector-index`.

## `alerts`

The fan-out record, and the only source of truth for how an organisation actually performs.

`dogReportId` · `organizationId` · `distanceKm` · `routingScore` · `urgency` · `channel`
(`email` · `sms` · `whatsapp` · `in_app`) · `status` (`sent` · `viewed` · `accepted` · `declined` ·
`expired` · `failed`) · `declineReason` · `error` · `sentAt` · `viewedAt` · `respondedAt`

**UNIQUE `{dogReportId, organizationId}`** — one alert per organisation per report, so a retry cannot
double-notify.

`expired` is distinct from `declined` on purpose: an alert that expired because someone else took the
case is not a failure by that organisation, and ignoring an alert is a different problem from
declining it.

## `adoptionlistings`

`organizationId` · `name` · `story` · `media[]` · `breed` · `ageMonths` · `sex` · `size` ·
`vaccinated` · `sterilized` · `specialNeeds` · `temperament[]` ·
`goodWith { kids, dogs, cats }` (tri-state — `null` means unknown, not "no") · `adoptionFee` ·
`location` (**2dsphere**) · `status` (`available` · `pending` · `adopted` · `withdrawn`) ·
`sourceReportId` → DogReport, when a rescued dog becomes adoptable.

## `adoptionapplications`

`listingId` · `organizationId` · `applicant` · `city` · `homeType` · `hasOutdoorSpace` ·
`hasOtherPets` · `householdAdults` · `hasChildren` · `experience` · `reason` ·
`status` (`submitted` · `reviewing` · `approved` · `rejected` · `withdrawn`) · `reviewNote`.

`organizationId` is denormalised from the listing so a rescuer's enquiry inbox is a single indexed
query rather than a lookup through every listing they own.

## `donations`

`amountPaise` (**integer paise — never a float; currency in floating point eventually loses money**) ·
`currency` · `donor { name, email, phone, anonymous }` ·
`target { type: organization | dog | platform_fund, organizationId?, dogReportId? }` ·
`razorpay { orderId, paymentId, signature }` ·
`status` (`created` · `paid` · `failed` · `refunded`) · `paidAt` · `failureReason` · `message`.

Status only moves to `paid` from a webhook whose HMAC verifies against the **raw** request body.

## `disbursements`

Money leaving the platform fund: `organizationId` · `amountPaise` · `purpose`
(`treatment` · `surgery` · `food` · `transport` · `sterilization` · `shelter` · `other`) ·
`note` · `dogReportId?` · `referenceNumber` · `disbursedAt` · `recordedByUserId`.

This exists so the fund is auditable. Asking people to donate to a pooled fund we disburse onward is
only reasonable if where it went is public.

---

## Index creation

Every index above is created explicitly by `ensureIndexes()`
([`backend/src/config/indexes.js`](backend/src/config/indexes.js)), called at server start and by the
seed script. Mongoose's lazy `autoIndex` was not enough — a geo query issued before the index
finished building fails outright with *"unable to find index for $geoNear query"*, and that is a
race you lose only in production.
