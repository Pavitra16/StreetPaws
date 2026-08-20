# 05 — Organisations, admin and the rescuer console

Three surfaces, deliberately separate: the public site, `/rescuer`, `/admin`.
Someone triaging injured animals is doing a job, not browsing a website.

---

## Applying — `POST /api/organizations`

**Screen:** [`pages/OrgRegister.jsx`](../frontend/src/pages/OrgRegister.jsx)
**Controller:** `applyAsOrganization` in
[`controllers/organizationController.js`](../backend/src/controllers/organizationController.js)

A public **application**, not a registration. It creates a record with
`applicationStatus: 'pending'`, `active: false`, `verified: false`, **no login
account**, and no alerts. Anyone may apply; applying grants nothing.

### Payload

```json
{
  "name": "Paws & Claws Animal Trust",
  "kind": "ngo",
  "lat": 28.5677, "lng": 77.2433, "city": "New Delhi",
  "serviceRadiusKm": 15, "capacity": 12,
  "phone": "+91 98110 42317",
  "email": "contact@example.org",
  "pan": "AACTP4821K",
  "specializations": ["injury", "surgery", "sterilization"],
  "registrationNumber": "S/RS/SW/1142/2014",
  "darpanId": "DL/2016/0104882"
}
```

### Uniqueness — why PAN

PAN is required of **everyone**, organisations and individual rescuers alike.

No NGO registration number works for this: society and trust numbers are issued
per state, so two unrelated NGOs in different states can legitimately hold the
same one. Only Section 8 companies get a nationally unique CIN, and Darpan IDs
exist only for organisations that registered on that portal.

PAN is issued once per entity by a single national authority, its format is
checkable (`/^[A-Z]{5}[0-9]{4}[A-Z]$/`), and both individuals and organisations
have one. Individual rescuers are asked for it too because they receive donations
and are handed members of the public's phone numbers.

Enforced in two places:

**The controller** does a friendly pre-check so the applicant gets a message
naming the field.

**The database** has three partial unique indexes — `unique_live_email`,
`unique_live_pan`, `unique_live_phone` — each scoped to
`applicationStatus ∈ {pending, approved}`.

The controller check alone loses a race: two applications submitted in the same
instant both see "no existing record" and both succeed. Only the database can
settle that. Verified — five concurrent applications with the same PAN produce
`201, 409, 409, 409, 409` and exactly one row.

Partial on status so rejected and suspended records stay as history and a
rejected applicant may reapply. What must never exist twice is an organisation
that can *currently* receive reports.

---

## Admin review — `POST /api/admin/organizations/:id/review`

**Screen:** [`pages/admin/AdminApplications.jsx`](../frontend/src/pages/admin/AdminApplications.jsx)

```json
{ "decision": "approve", "verified": true, "note": "Checked Darpan listing" }
```

`decision` is `approve` | `reject` | `suspend`.

On approve the controller:

1. sets `applicationStatus: 'approved'`, `active: true`, `verified` as chosen
2. **creates the `User` account** with a generated temporary password and
   `mustChangePassword: true`
3. links `organization.ownerUserId` ↔ `user.organizationId`
4. emails the credentials, and returns them **once** in the response

The response reports `emailed: true|false` with a reason. An earlier version
hardcoded `emailed: Boolean(credentials)`, which told the admin credentials had
been sent when nothing had left the machine — a rescuer waiting on an email that
was never sent simply never signs in.

There is deliberately **no admin-side password reissue**. Once issued, the
password belongs to the organisation.

### Approval and verification are separate grants

| | Grants |
|---|---|
| **Approved** | receives alerts, can accept cases, can list dogs, can receive donations |
| **Verified** | *additionally* may see reporter phone numbers |

An admin can approve without verifying. That organisation works cases with
personal data hidden.

`Organization.operationalFilter()` — `{ applicationStatus: 'approved', active: true }` —
is the single definition of "may operate", used by routing, adoption and
donations alike, so an unreviewed applicant can never collect money or see a
reporter.

---

## Admin console

**Shell:** [`components/admin/AdminLayout.jsx`](../frontend/src/components/admin/AdminLayout.jsx) — dark, its own navigation.

| Screen | Endpoint |
|---|---|
| Overview | `GET /api/admin/stats` |
| Applications | `GET /api/admin/organizations?status=pending` |
| NGOs / Rescuers | `GET /api/admin/organizations?kind=ngo&status=approved` |
| Organisation detail | `GET /api/admin/organizations/:id/detail` |

The detail page answers *what have they actually done* rather than *what did they
claim* — cases resolved, acceptance rate, average response time, alerts never
answered, dogs listed, money received and paid out, recent cases.

---

## The rescuer console

**Shell:** [`components/rescuer/RescuerLayout.jsx`](../frontend/src/components/rescuer/RescuerLayout.jsx)
Three sections: Cases, Dogs for adoption, Enquiries.

### The queue — `GET /api/organizations/:id/queue`

Guarded by `requireOrgMember('id')`: you may only read your own organisation's
queue. Returns alerts still needing a decision, worst first, each with the
report, the distance and the routing score.

Reporter phone numbers are revealed here **only if the organisation is
verified** — this is a working view of one queue, not a bulk search.

### Accepting — `POST /api/organizations/:id/alerts/:alertId/respond`

```json
{ "decision": "accept" }          // accept | decline | view
```

Accepting is where several things move at once:

```js
if (report.assignedOrganizationId && !== this org) {
  alert.status = 'expired';
  throw ApiError.conflict('Another rescuer has already taken this case');
}

alert.status = 'accepted';
report.assignedOrganizationId = org._id;
report.pushStatus('assigned', { byOrganizationId: org._id });
org.activeCaseCount += 1;
org.responseStats.accepted += 1;
org.responseStats.avgResponseMinutes = runningMean(...);

// everyone else's alert for this report is now moot
await Alert.updateMany(
  { dogReportId, _id: { $ne: alert._id }, status: { $in: ['sent','viewed'] } },
  { $set: { status: 'expired', respondedAt: new Date() } }
);
```

The first-accept-wins check is the race that matters: two rescuers tapping
*Accept* on the same dog must not both be dispatched.

`avgResponseMinutes` is kept as a running mean so it never has to re-scan every
past alert.

### Closing a case — `POST /api/organizations/:id/reports/:reportId/resolve`

```json
{ "status": "resolved", "note": "Treated and released" }
```

Frees the capacity slot (`activeCaseCount -= 1`) and increments
`responseStats.resolved`, but only on the transition from open to closed, so
re-submitting cannot double-count.

---

## Alert statuses

`sent → viewed → accepted | declined | expired | failed`

`expired` is distinct from `declined` on purpose: an alert that expired because
someone else took the case is not a failure by that organisation. And *ignoring*
an alert is a different problem from declining one — only one of the two is worth
acting on, which is why the admin detail page counts "never answered" separately.
