# StreetPaws — code walkthrough

Written for someone who has the repository open and wants to know *what actually
happens*: which file, which function, which request, which document in the
database.

Read them in order the first time. Afterwards use the index.

| | |
|---|---|
| [01 — Architecture](01-architecture.md) | Folder map, what a request passes through, the background job queue |
| [02 — Data model](02-data-model.md) | The eight collections and how they connect. Field-level schema lives in [`../DATABASE.md`](../DATABASE.md) |
| [03 — Reporting a dog](03-reporting-a-dog.md) | The core flow. Button press → Cloudinary → database → AI → routing → email |
| [04 — Finding a dog](04-finding-a-dog.md) | Search by area, by breed, and photo matching |
| [05 — Organisations & admin](05-organisations-and-admin.md) | Applying, being approved, the alert queue, accepting a case |
| [06 — Adoption](06-adoption.md) | Listings, applications, review |
| [07 — Donations](07-donations.md) | Three payment providers behind one decision, and the fund ledger |
| [08 — Authentication](08-authentication.md) | Cookies, roles, password reset, what each role may see |
| [09 — API reference](09-api-reference.md) | Every endpoint, its payload and its response |
| [10 — The lost-dog page](10-lost-dog-flow.md) | Contact, sightings and automatic matching — what a stranger who spots the dog can do |
| [11 — Who can do what](11-access-model.md) | Public vs manage link vs password, and why most of the site needs no account |

## The shape of the thing

```
┌────────────── frontend (React + Vite, :5173) ─────────────┐
│  pages/  →  lib/api.js (axios)  →  /api/*                 │
└───────────────────────────┬───────────────────────────────┘
                            │  JSON over HTTP, cookie for auth
┌───────────────────────────▼───────────────────────────────┐
│                backend (Express, :5000)                    │
│  routes/ → middleware/ → controllers/ → services/ → models │
└───────────────────────────┬───────────────────────────────┘
                            │
        ┌───────────────────┼──────────────────┐
        ▼                   ▼                  ▼
  MongoDB Atlas        Cloudinary       Gemini / CLIP / SMTP
  (documents,          (photos and      (analysis, embeddings,
   geo, vectors)        video)           alert email)
```

## Three ideas that explain most decisions

**The reporter is standing next to an injured animal.** They are on a phone,
possibly on bad mobile data, and in a hurry. That is why `POST /api/reports`
returns before the AI runs, why photos upload straight to Cloudinary instead of
through this server, and why nothing about reporting requires an account.

**Alerting must never depend on the AI.** Gemini has a 20-request daily free
tier and can be down. Every failure path in the analysis job still fans out to
rescuers — the dog gets help, just without a breed estimate.

**The database is the source of truth, not a cache of it.** Response statistics
are counted from `Alert` rows, urgency is stored because Mongo cannot index a
virtual, and a donation records which gateway took it. Numbers that are derived
somewhere else eventually disagree with reality — an earlier version of the seed
displayed acceptance rates of 378%.
