# 06 — Adoption

Browse dogs listed by approved organisations, apply for one, and have the
organisation review the application.

| Screen | File |
|---|---|
| Browse | [`pages/Adopt.jsx`](../frontend/src/pages/Adopt.jsx) |
| One dog | [`pages/AdoptionDetail.jsx`](../frontend/src/pages/AdoptionDetail.jsx) |
| Create a listing | [`pages/ListingCreate.jsx`](../frontend/src/pages/ListingCreate.jsx) |
| Rescuer's listings | [`pages/rescuer/RescuerListings.jsx`](../frontend/src/pages/rescuer/RescuerListings.jsx) |
| Rescuer's enquiries | [`pages/rescuer/RescuerEnquiries.jsx`](../frontend/src/pages/rescuer/RescuerEnquiries.jsx) |

Controller: [`controllers/adoptionController.js`](../backend/src/controllers/adoptionController.js)

---

## Browsing — `GET /api/adoptions`

```
lat, lng, radiusKm    optional, default 50
city                  string
breed                 string
size                  small | medium | large
sex                   male | female | unknown
goodWithKids          boolean
limit                 default 40
```

Only `status: 'available'` listings from organisations passing
`Organization.operationalFilter()` are returned, so a suspended organisation's
dogs disappear from the public site without deleting the records.

Each result carries the listing plus a narrow projection of its organisation
(`name kind phone email verified location`) and a computed `distanceKm`.

> **A bug this projection caused.** `hasCapacity` is a virtual computed as
> `activeCaseCount < capacity`. Neither field is in that projection, so it
> evaluated `undefined < undefined` → `false`, and every organisation reported
> itself as full — including ones with no cases. It now returns `null` when the
> counts were not loaded, because "not known here" and "no room" are different
> answers.

---

## Creating a listing — `POST /api/adoptions`

`requireAuth` + `requireRole('ngo', 'helper')`.

```json
{
  "name": "Kabir",
  "story": "Brought in after a road accident two years ago…",
  "media": [{ "cloudinaryPublicId": "…", "url": "…", "isPrimary": true }],
  "breed": "Indian Pariah",
  "ageMonths": 26,
  "sex": "male",
  "size": "large",
  "vaccinated": true,
  "sterilized": true,
  "specialNeeds": "Old fracture in the left hind leg…",
  "temperament": ["calm", "protective"],
  "goodWith": { "kids": true, "dogs": false, "cats": null },
  "adoptionFee": 500,
  "sourceReportId": "6a7c…"
}
```

`temperament` is a closed enum: `calm | playful | shy | protective | energetic |
affectionate`. Free text there would fragment the same way breeds did.

`goodWith` is **tri-state** — `true`, `false`, or `null` for unknown. Defaulting
an unknown to `false` would tell an adopter with children that a dog is unsafe
around them when nobody has assessed it.

`location` is copied from the organisation. `sourceReportId` links back to the
street report the dog came from, which is how a rescue becomes an adoption.

Photos go through the same signed Cloudinary path as reports — see
[03](03-reporting-a-dog.md).

---

## Applying — `POST /api/adoptions/:id/apply`

**Public.** No account required — an adopter should not have to register to
enquire about a dog. Rate-limited by `formLimiter`.

```json
{
  "applicant": { "name": "Shruti", "phone": "+91 98204 11763",
                 "email": "shruti@example.com" },
  "city": "New Delhi",
  "homeType": "apartment",
  "hasOutdoorSpace": false,
  "hasOtherPets": false,
  "householdAdults": 2,
  "hasChildren": false,
  "experience": "Grew up with two indies…",
  "reason": "I work from home four days a week…"
}
```

The controller copies `organizationId` from the listing onto the application.
That denormalisation is deliberate: a rescuer's enquiry inbox is then a single
indexed query rather than a lookup through every listing they own.

---

## Reviewing — `POST /api/adoptions/applications/:id/review`

`requireAuth` + `requireRole('ngo', 'helper', 'admin')`.

```json
{ "status": "approved", "note": "Home visit done, all good" }
```

Statuses: `submitted → reviewing → approved | rejected | withdrawn`.

A rescuer may only review applications belonging to their own organisation —
checked against `req.user.organizationId`, with admin exempt.

---

## Marking a dog adopted — `PATCH /api/adoptions/:id`

```json
{ "status": "adopted" }
```

Ownership is enforced the same way:

```js
if (String(listing.organizationId) !== String(req.user.organizationId)
    && req.user.role !== 'admin') {
  throw new ApiError(403, 'This listing belongs to another organisation');
}
```

Adopted listings drop out of the public browse (which filters
`status: 'available'`) but stay in the rescuer's own list and in the database.
The seed keeps one deliberately — *"this listing stays up because people ask what
happens to the older ones."*
