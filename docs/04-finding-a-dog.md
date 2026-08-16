# 04 — Finding a dog

**Screen:** [`pages/FindDog.jsx`](../frontend/src/pages/FindDog.jsx) — three
tabs: *By area*, *By breed*, *By photo*.

The first two are one endpoint. The third is a different one.

---

## By area / by breed → `GET /api/search/near`

**Controller:** `searchNear` in
[`controllers/searchController.js`](../backend/src/controllers/searchController.js)

### Query parameters

```
lat, lng          required
radiusKm          0.5–200, default 15
kind              found | lost
condition         healthy | injured | sick | critical
breed             free text
status            comma separated, e.g. "open,assigned"
minUrgency        1–5
from, to          date range on occurredAt
sort              distance | recent | urgency        (default distance)
page, limit       default 1, 50
```

### How the filter is built

```js
const filter = { location: withinRadius(lat, lng, radiusKm) };
if (kind) filter.kind = kind;
if (condition) filter.condition = condition;
if (minUrgency) filter.effectiveUrgency = { $gte: minUrgency };
```

`withinRadius` produces a `$geoWithin` / `$centerSphere` query, served by the
`2dsphere` index on `location`.

`minUrgency` filters on the **stored** `effectiveUrgency`, not the raw model
score — otherwise a reporter-flagged critical case with a low AI reading would be
excluded from exactly the query meant to surface it.

### The breed clause

```js
filter.$or = [
  { 'aiAnalysis.breed': rx },
  { breedGuess: rx },
  { breedGuess: { $in: [null, ''] }, 'aiAnalysis.breed': { $in: [null, ''] } },
];
```

Three cases: the AI's reading matches, the reporter's typed breed matches, **or
no breed was recorded at all**.

That third clause is a product decision. Whoever finds a street dog usually
cannot name the breed, and leaving the field blank is the honest answer. If those
reports are filtered out, an owner searching for their Beagle never sees the one
report that was actually their dog. A few extra results cost a moment of
scrolling; hiding the right one costs the dog. **Recall over precision.**

`$in: [null, '']` also matches documents where the field was never set, so one
clause covers blank, empty-string and absent alike.

Every result carries `breedConfirmed: true|false` so the UI can show a
*"breed not recorded"* chip — otherwise a dog that is plainly not a Beagle
appearing in a Beagle search reads as a broken filter.

### Sorting

Two paths:

```js
const breedFiltered = Boolean(q.breed);
const sortInMemory = !sortSpec || breedFiltered;
```

**In MongoDB** for the plain cases (`recent`, `urgency`), using `.sort().skip().limit()`.

**In memory** — fetch up to 500, sort, slice — for two situations:

- *distance*, because `$geoWithin` does not order by distance and `$near` cannot
  be combined with `skip` reliably at scale
- *a breed search*, because confirmed breed matches must rank above the
  blank-breed ones the filter deliberately lets through, and `breedConfirmed` is
  derived from two fields rather than stored, so there is nothing for Mongo to
  sort on without an aggregation stage

```js
results.sort((a, b) =>
  breedFiltered
    ? Number(b.breedConfirmed) - Number(a.breedConfirmed) || chosen(a, b)
    : chosen(a, b)
);
```

Without this a report that simply happens to be closer outranks the one dog that
actually matches the search. At 21 reports that is cosmetic; over a few thousand,
most of them blank, it would bury every real match.

**Known ceiling:** past ~500 matching reports in one radius the in-memory sort
would need to become an aggregation with `$addFields`.

### Response

```json
{
  "results": [ { "id": "...", "breedGuess": "Beagle", "breedConfirmed": true,
                 "effectiveUrgency": 5, "distanceKm": 1.4,
                 "contact": { "phone": "+91••••••01", "masked": true },
                 "primaryMedia": { "thumbnailUrl": "..." } } ],
  "total": 17, "page": 1, "limit": 50, "hasMore": false,
  "origin": { "lat": 28.56, "lng": 77.24 }, "radiusKm": 15
}
```

List views **never** reveal contact details, to anyone. See
[03](03-reporting-a-dog.md#contact-masking).

---

## By photo → `POST /api/search/match`

**Controller:** `matchReports` in
[`controllers/matchController.js`](../backend/src/controllers/matchController.js)
**Service:** [`services/matchService.js`](../backend/src/services/matchService.js)

### Request

Either an existing report, or a one-off photo:

```json
{ "reportId": "6a7c…", "kind": "found", "limit": 20 }
```
```json
{ "imageUrl": "https://res.cloudinary.com/…", "lat": 28.55, "lng": 77.20,
  "lostAt": "2026-08-05", "breed": "Beagle", "kind": "found" }
```

### Retrieval

```js
if (embedding?.length === EMBEDDING_DIM) {
  // MongoDB Atlas $vectorSearch, kNN, cosine, index dogreport_embedding_index
} else {
  // in-memory scan of candidates of the opposite kind
}
```

The fallback is not belt-and-braces: the vector index must be created on the
cluster (`npm run vector-index`) and a fresh clone will not have one.

### Scoring

Four signals:

```
visual       cosine similarity of CLIP embeddings          weight 0.50
attributes   breed, colours, size, distinctive marks       weight 0.25
geo          distance decay                                weight 0.15
time         how far apart the dates are                   weight 0.10
```

**Scored over the signals actually available**, not all four:

```js
const active = [
  hasVisual      && [weights.visual, visual],
  hasAttributes  && [weights.attributes, attributes],
  [weights.geo, geo],
  [weights.time, time],
].filter(Boolean);

const score = active.reduce((s, [w, v]) => s + w * v, 0)
            / active.reduce((s, [w]) => s + w, 0);
```

Why: a missing signal used to contribute zero out of its full weight, so with no
stored embeddings the best possible match capped at 35% — an owner looking at
their own dog was told 35% and reasonably moved on. Ranking was unaffected (every
row lost the same amount) but the number shown to a person was wrong, and that
number is the entire point of showing a score.

Unavailable signals report `null`, not `0`. "Could not compare" and "compared and
scored nothing" are different statements, and an empty progress bar labelled
*Looks alike* says the second.

### The UI must state its basis

[`components/ai/MatchResultCard.jsx`](../frontend/src/components/ai/MatchResultCard.jsx)
shows the per-signal breakdown, renders *"not compared"* for null signals, and —
when nothing about the animal itself was compared — adds *"on location & time
only"* under the percentage and changes the footer to:

> *Nothing about this dog's appearance was compared — only where and when it was seen.*

Because scored over available signals, a dog compared only on distance and date
can reach 90%. Unqualified, that tells an owner they have found their dog.

### Measured, not eyeballed

`backend/eval/` scores the ranking against a labelled set: **P@1 49.2%,
R@5 68.3%, MRR 0.581** on 120 queries against a 500-image gallery, versus 0.2%
chance.

The eval also produced a negative result worth keeping: **CLIP's visual scores
alone were flat and inversely ordered** on this data — 0.785–0.860 across the
board, with the wrong dog often scoring highest. Pure vector search ranked the
correct dog *below* the wrong ones. The attribute, geo and time signals are what
make the combined score work.

### Current state

Seeded reports have no embeddings (the seed does not call the analyser), so
`visual` is `null` for them and matching runs on the other three signals.
Reports created through the live flow **do** get embeddings automatically.
`npm run embed-backfill` fills in the rest.
