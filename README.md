# StreetPaws

Anyone who finds a street dog that is injured, sick or lost can photograph it, drop a pin on the
exact spot, and have that report reach the nearest verified NGO or independent rescuer within
seconds — ranked so the bleeding dog is seen before the healthy one.

Built for India, where the street-dog population is large and the rescue network is a scattered mix
of registered NGOs and individual volunteers who mostly find out about cases through WhatsApp.

## What it does

| | |
|---|---|
| **Report** | Photo + video upload, exact location on a map, AI triage assigns an urgency of 1–5, and the report fans out to nearby approved rescuers ranked by distance, spare capacity and specialisation |
| **Find** | Owners search lost dogs by location and breed, or upload a photo and match it visually against every open report |
| **Adopt** | Browse dogs listed by approved NGOs and rescuers, apply, and have the organisation review the application |
| **Donate** | To a specific organisation, to one dog's treatment, or to a platform fund with a public disbursement ledger |

## Why the AI is here, and what it actually does

Two models, each doing a job a rule could not.

**Triage.** One Gemini vision call per report returns breed, colours, distinctive marks, visible
injuries and an urgency score. Urgency is stored as `max(reporter's assessment, model's assessment)` —
the model can escalate a case but never quietly downgrade one. It ranks a queue; a human always
decides. The UI labels it an assessment, not a diagnosis, and it never gates a response.

**Photo matching.** CLIP embeddings (512-dim, generated locally in Node at no API cost) stored on
each report and queried with MongoDB Atlas Vector Search, combined with attribute overlap,
geographic distance and a date window:

```
score = 0.50 · cosineSimilarity(embeddings)
      + 0.25 · attributeOverlap(breed, colours, marks, size)
      + 0.15 · geoProximity(distanceKm)
      + 0.10 · timeWindow(daysApart)
```

### Matching is measured, not eyeballed

120 queries against a 500-image gallery drawn from [DogFaceNet](https://github.com/GuillaumeMougeot/DogFaceNet):

| Metric | Score | Chance |
|---|---|---|
| Precision@1 | 49.2% | 0.2% |
| Recall@5 | 68.3% | |
| Recall@10 | 73.3% | |
| MRR | 0.581 | |

Reproducible from [`backend/eval/`](backend/eval):

```bash
npm run eval:pairs && npm run eval:embed && npm run eval:score
```

The eval also disproved an assumption worth recording. CLIP's visual scores alone were flat and
*inversely* ordered on this data — the worst match often scored highest, so pure vector search
ranked the correct dog below the wrong ones. The attribute, geo and time signals are what make the
combined score work. The harness is also what chose the model: `clip-vit-base-patch16` beat
`patch32` on measured recall, not on preference.

## Trust and privacy

Two decisions that shaped the data model:

- **Reporter phone numbers are masked** in public views and in *every* list or search view. They are
  revealed only to a verified organisation, and only on an individual report page — so no one can
  harvest contacts in bulk.
- **Approval and verification are separate grants.** Approval lets an organisation work cases.
  Verification is what grants access to personal data. An admin can approve without verifying.

Organisations apply publicly; nothing is active until an admin approves. Approval is what creates the
login account. Passwords, once issued, are the organisation's own — there is deliberately no
admin-side password reissue.

## Stack

**Frontend** — React 19, Vite, Tailwind 4, TanStack Query, React Router, Leaflet + OpenStreetMap

**Backend** — Express 5, Mongoose 9, MongoDB Atlas (`2dsphere` + Vector Search), Cloudinary
(signed direct-from-browser uploads), Razorpay, Zod validation, JWT in an httpOnly cookie,
bcrypt at 12 rounds, express-rate-limit

**AI** — Google Gemini for vision, with a local Ollama fallback when the free tier's daily quota is
exhausted; `@huggingface/transformers` CLIP for embeddings, running locally

## Data model

Eight collections. Location is GeoJSON everywhere, so `$near` and `$geoWithin` work uniformly.

```
User ──owns──> Organization ──posts──> AdoptionListing ──> AdoptionApplication
                    │  ▲                      ▲
              alerted│  │assigned             │sourceReportId
                    ▼  │                      │
                  Alert └───── DogReport ─────┘
                                   ▲
                    Donation ──────┘        Disbursement ──> Organization
```

`DogReport` holds lost *and* found reports in one collection — matching is then a query within a
single index rather than a join. Full schema, including the geospatial, vector and partial-unique
indexes, is in [`DATABASE.md`](DATABASE.md).

## Running it locally

```bash
git clone <this repo>
cd project1

cp backend/.env.example backend/.env    # fill in the values
npm install --prefix backend
npm install --prefix frontend

npm run seed --prefix backend           # 21 reports, 9 organisations, logins
npm run dev --prefix backend            # :5000
npm run dev --prefix frontend           # :5173
```

Only `MONGODB_URI` and `JWT_SECRET` are required. Every other integration degrades gracefully —
without a Gemini key reports simply save unanalysed, without Cloudinary uploads are disabled, and
`GET /api/health` reports which features are live.

## Status

The rescue loop is complete and working: report → AI triage → geospatial routing → rescuer accepts →
case tracked to resolution. Adoption and the admin console are built. Donations are built but need
Razorpay test keys to run.

Triage urgency has not yet been validated against a labelled set of genuinely injured dogs — every
test image so far has been a healthy animal, all correctly scored 1. That validation is the next
piece of measurement worth doing, and until it exists the urgency scores should be read as untested.

## Licence

MIT
