# 03 — Reporting a dog

The core flow. Everything else exists to support it.

**Screen:** [`pages/ReportDog.jsx`](../frontend/src/pages/ReportDog.jsx) — four
steps: Photos → Location → Details → Contact.

No account required. `POST /api/reports` has no auth middleware, and neither
does the upload signature endpoint, deliberately — see the note at the end.

---

## Step 1 — Photos

**Component:** [`components/upload/MediaUploader.jsx`](../frontend/src/components/upload/MediaUploader.jsx)
**Hook:** [`hooks/useCloudinaryUpload.js`](../frontend/src/hooks/useCloudinaryUpload.js)

On a phone there are two buttons — *Take a photo* (camera) and *Choose from
gallery*. On desktop, one *Choose files*. They are two separate `<input>`
elements because `capture="environment"` is not a hint: a browser that honours
it opens the camera and offers nothing else, so a single input carrying it made
picking an existing photo impossible.

The visibility split uses `@media (pointer: coarse)`, a capability query — a
narrow desktop window is not a phone, and a tablet with a camera is.

### The file bytes never touch this server

```
browser ──1── POST /api/uploads/signature ──▶ backend
        ◀──2── { signature, timestamp, folder, allowedFormats, apiKey, cloudName }
        ──3── POST direct to api.cloudinary.com ─▶ Cloudinary
        ◀──4── { public_id, secure_url, width, height }
```

**1 → 2.** [`controllers/uploadController.js`](../backend/src/controllers/uploadController.js)
signs `{ timestamp, folder, allowed_formats }` with the Cloudinary API secret.
The secret stays server-side; the browser receives a short-lived token scoped to
exactly those parameters.

`allowed_formats` is *signed*, not merely advertised. This endpoint is public,
so a signature could be lifted from the network tab — signing the format list
means the worst that can be done with a stolen one is put another photo in our
folder, not an arbitrary file of any type. The rate limiter (60/hour in
production) is the other half.

**3 → 4.** The browser posts the file to Cloudinary with those exact parameters,
byte-identical, or Cloudinary rejects it with *Invalid Signature*.

The alternative — an unsigned upload preset — puts an open upload endpoint for
your account into the page source.

---

## Step 2 — Location

**Component:** [`components/map/MapPicker.jsx`](../frontend/src/components/map/MapPicker.jsx)
**Hook:** [`hooks/useGeolocation.js`](../frontend/src/hooks/useGeolocation.js)

Browser geolocation for a first fix, then a **draggable Leaflet pin**, plus
Nominatim address search as a fallback. Street dogs do not stay put; the pin is
the thing rescuers navigate to, so it has to be adjustable.

Markers use Leaflet `divIcon` rather than image markers — bundlers rewrite asset
paths and Leaflet's default icon URLs break silently in production.

---

## Steps 3 & 4 — Details and contact

Condition (`healthy` / `injured` / `sick` / `critical`), an optional description,
an optional breed with a `<datalist>` of suggestions, and the reporter's name
and phone.

The breed field stays free text. The suggestions exist so four people describing
the same dog do not produce "Indie", "Indian Pariah", "mixed" and "desi", which
would make a breed search miss three of them. Leaving it blank is fine and is
handled — see [04 — Finding a dog](04-finding-a-dog.md).

---

## Submit

### Request

```http
POST /api/reports
Content-Type: application/json
```

```json
{
  "kind": "found",
  "media": [{
    "cloudinaryPublicId": "streetpaws/abc123",
    "url": "https://res.cloudinary.com/.../abc123.jpg",
    "thumbnailUrl": "https://res.cloudinary.com/.../w_400/abc123.jpg",
    "resourceType": "image",
    "isPrimary": true
  }],
  "lat": 28.5677,
  "lng": 77.2433,
  "address": "Ring Road, Lajpat Nagar",
  "city": "New Delhi",
  "condition": "critical",
  "description": "Hit by a scooter. Not standing, bleeding from a back leg.",
  "breedGuess": "Indian Pariah",
  "contact": { "name": "Nikhil", "phone": "+91 98219 66401" }
}
```

Validated by `createReportSchema` in
[`controllers/reportController.js`](../backend/src/controllers/reportController.js).
`media` requires at least one item — a report without a photo cannot be triaged,
matched or acted on.

### What the controller does

```js
// exactly one primary image is guaranteed, defaulting to the first
const media = b.media.map((m, i) => ({ ...m, isPrimary: ... }));

const report = await DogReport.create({
  kind, media,
  location: toPoint({ lat, lng, address, city, state, pincode }),
  contact, description, condition, dogName, breedGuess,
  occurredAt: b.occurredAt ?? new Date(),
  analysisState: 'pending',
  statusHistory: [{ status: 'open', at: new Date(), note: 'Report submitted' }],
});

queueAnalysis(report.id);          // deliberately NOT awaited
res.status(201).json(serializeReport(report, { revealContact: true }));
```

`toPoint()` converts to GeoJSON — `[lng, lat]`, the opposite order to how people
say it. Every conversion lives in `utils/geo.js` so the trap is in one place.

**201 comes back immediately.** The AI has not run. Making someone standing over
a bleeding dog wait ~8 seconds for a vision model before they get confirmation is
the wrong trade.

---

## What happens after the response

[`jobs/analyzeReport.js`](../backend/src/jobs/analyzeReport.js), asynchronously.

### 1. Vision analysis

`services/aiService.js` sends the Cloudinary URL — transformed to a 1024px cap,
which cuts image tokens with no accuracy loss at this task — to Gemini with a
`responseSchema`, so the reply is validated JSON rather than prose:

```json
{
  "isDog": true,
  "breed": "Indian Pariah (mixed)",
  "breedConfidence": 0.78,
  "colors": ["tan", "white chest"],
  "distinctiveMarks": ["torn left ear"],
  "injuries": ["visible limp, front-right", "open wound on flank"],
  "urgency": 4,
  "generatedDescription": "Medium-sized tan Indian Pariah, adult…"
}
```

If Gemini fails on a quota or availability error, `shouldFallOver()` routes the
same prompt and schema to a local Ollama model.

### 2. Embedding

`services/embeddingService.js` runs CLIP (`Xenova/clip-vit-base-patch16`) locally
via `@huggingface/transformers` — 512 floats, no API call, no per-image cost.
Stored on `DogReport.embedding` with `select: false` so 512 numbers never ride
along in an API response.

### 3. Urgency

```js
effectiveUrgency = max(urgency from reporter's condition, urgency from AI)
```

Stored, not computed on read, because MongoDB cannot index a virtual and the
whole triage queue sorts on it. Taking the max means **the model can escalate a
case but never quietly downgrade a human's judgement.**

### 4. Fan-out

`services/routingService.js` → `rankOrganizationsForReport()`:

```
reach       urgency 5 → 25km, 4 → 18, 3 → 12, 2 → 8, 1 → 6
candidates  approved + active organisations within reach, with spare capacity
score       distance + capacity + specialisation match + past acceptance rate
```

`weightsForUrgency()` shifts the weighting towards raw proximity at urgency 4–5 —
for a dying dog, "who is closest" matters more than "who is the best fit".

`services/notifyService.js` → `fanOutReport()` then creates one `Alert` row per
chosen organisation and delivers it:

- **in-app** — the `Alert` row itself. Always created, never fails. This is the record.
- **email** — `sendDogAlert()` on top, best effort. This is what reaches a
  rescuer who is not sitting with the site open, which is nearly always.

If nobody is reachable, the search widens to 40km rather than silently dropping
the report.

**This entire step runs even when the AI failed.** Alerting never depends on
Gemini.

---

## Contact masking

`utils/serialize.js` decides who sees the reporter's phone number:

| Viewer | Sees |
|---|---|
| Public | `+91••••••01` |
| Unverified organisation | `+91••••••01` |
| Verified organisation, **list or search view** | `+91••••••01` |
| Verified organisation, **single report page** | the real number |
| Anyone, on a **lost** report whose owner published it | the real number |

The list-view exclusion is the important one. Revealing on one report is a
deliberate act about one animal; revealing across a paginated search turns the
endpoint into a bulk export of every reporter's phone number — one request,
fifty numbers.

### The lost-report exception

The table above was written for **found** reports, where the reporter is a
bystander who did a good deed and did not sign up for phone calls. A **lost**
report inverts that: the reporter is the owner, and the entire purpose of the
page is that whoever spots the dog can reach them. A hidden number there is a
missing-pet poster with the number blacked out.

So the lost flow offers a checkbox — *"Show my phone number on the page"* —
ticked by default, and `contact.showPublicly` records the answer. Consent is
explicit rather than implied by `kind` because some owners would rather be
reached another way, and because publishing a phone number should be something
someone chose, not something we inferred.

Two guards keep it narrow:

```js
// reportController — a found report carries a bystander's number, and it is
// not theirs to publish, so a crafted payload cannot set this either.
showPublicly: b.kind === 'lost' && b.contact.showPublicly === true
```

```js
// serialize — opt-in per call site, so consent applies on one dog's page and
// never to a list. Only the two single-report endpoints pass it.
serializeReport(report, { revealContact, allowOwnerConsent: true })
```

The serialized contact carries `publishedByOwner` so the page can explain *why*
a number is visible rather than just showing it.
