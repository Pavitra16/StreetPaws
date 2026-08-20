# 10 — The lost-dog page

What someone can actually *do* after opening a report for a missing dog.

**Screen:** [`pages/ReportDetail.jsx`](../frontend/src/pages/ReportDetail.jsx),
which renders three extra sections when `report.kind === 'lost'`.

For a long time `kind === 'lost'` changed a chip and the page title and nothing
else. The page named a missing dog, masked the owner's number, showed a map with
no way out of it, and offered no next step — while the matching engine that
could have found the dog sat unused one module away.

---

## The reader

Not the owner. The owner already knows. The person on this page is usually a
stranger who has just seen a dog that might be Coco, is standing on a pavement
holding a phone, and has no account and no intention of making one.

Every action here is one tap, and none of them require signing in.

---

## 1. Contact — `LostDogActions`

**Call** and **WhatsApp** appear only when the owner published their number
(see [03](03-reporting-a-dog.md#the-lost-report-exception)). WhatsApp is not
decoration: in India that is how a neighbourhood actually passes this around.

```js
// wa.me wants digits only; stored numbers look like "+91 97170 63328"
const digits = String(phone).replace(/\D/g, '');
```

**Share** uses `navigator.share` when it exists — that opens the phone's own
share sheet, and therefore WhatsApp — and falls back to copying the link on
desktop. `AbortError` is swallowed: dismissing the sheet is not a failure.

**Open in Maps** exists because a last-seen pin you cannot get directions to is
not actionable. It links to `google.com/maps/search/?api=1&query=lat,lng`.

When the number is private the block still renders, with the two remaining
actions and copy that points to the sighting form instead.

---

## 2. Sightings — `SightingsPanel` + `SightingForm`

A lost dog moves, so a single "last seen" pin is stale within hours. Each
sighting narrows where to look next, which is why the list is newest-first and
each entry shows its distance **from the original report** — the useful reading
is the drift:

```
Deer Park gate          2.52 km from where Coco went missing   3 hr ago
Green Park market       1.45 km                                9 hr ago
Hauz Khas bus stop      0.53 km                                20 hr ago
```

### Why `Sighting` is its own collection

The obvious reuse was a `DogReport` with `kind: 'found'` and a link field —
free geo indexing, media and matching. It is the wrong shape:
`createReport` queues analysis, and analysis **fans out to every rescuer in
range**. A sighting of a healthy pet that is already being looked for would page
an NGO and eat a capacity slot meant for a dog bleeding on a road.

A sighting therefore has no condition, no urgency, no status workflow and no
assignment. It is an observation — a pin, a time, and optionally a photo and a
note.

### Everything except the pin is optional

Requiring a phone number before accepting *"I saw your dog by the metro"* loses
the sighting from anyone unwilling to hand theirs over, and a pin on a map is
worth having on its own.

Sighting reporters' numbers are **never** shown, to anyone. They are passers-by
doing the owner a favour — exactly who the masking rule was written for — and
unlike an owner they were never offered the choice to publish. The API returns
only a name and a boolean:

```json
{ "contact": { "name": "Sunita Menon", "hasContactDetails": true } }
```

The owner is emailed (`sendSightingLogged`) on a best-effort basis: the record is
what matters, the email is what reaches their phone. Same split as the rescuer
fan-out.

---

## 3. Possible matches — `PossibleMatches`

`POST /api/search/match` with `{ reportId, kind: 'found' }`, run on page load.

The engine already existed and this page never called it. An owner had to notice
the "search by photo" tab, re-upload a photo of the dog they had just posted, and
re-type where it went missing — to run a comparison the server could do from the
report id alone.

The empty state matters as much as the results: no matches is the common case,
especially early, and it must read as a real answer rather than a broken feature.

> **Bug this surfaced.** Match results are queried with `.lean()`, which skips
> the `toJSON` transform that renames `_id` to `id`. Every match result shipped
> `_id` and no `id`, so the UI built links to `/reports/undefined` — the one
> click the whole matching feature exists to offer, broken in the existing photo
> search too. Fixed in `serializeReport`, next to the other lean() fallbacks.

---

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/reports/:id/sightings` | — | The trail, newest first, max 50 |
| POST | `/reports/:id/sightings` | — | Log one. `formLimiter`. 400 unless the report is `kind: 'lost'` |

<details><summary><code>POST /reports/:id/sightings</code></summary>

```json
{ "lat": 28.5301, "lng": 77.2101,
  "address": "Saket District Centre", "city": "New Delhi",
  "seenAt": "2026-08-13T14:00:00Z",
  "note": "Limping near the metro gate. Would not come to me.",
  "media": [{ "cloudinaryPublicId": "…", "url": "…" }],
  "contact": { "name": "Meera Iyer", "phone": "+91 98200 33445" } }
```

Only `lat` and `lng` are required. Returns the sighting with `distanceKm` from
the original report and the contact reduced to a name.
</details>
