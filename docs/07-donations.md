# 07 — Donations

**Screen:** [`pages/Donate.jsx`](../frontend/src/pages/Donate.jsx)
**Controller:** [`controllers/donationController.js`](../backend/src/controllers/donationController.js)

Three destinations: the platform fund, a specific approved organisation, or one
dog's treatment.

---

## Money is stored as integers

`amountPaise`, never rupees. Universal rule in payments, and the reason is
arithmetic:

```js
0.1 + 0.2 === 0.30000000000000004
```

Floating point loses money over enough transactions. Integers in the smallest
unit; format for display only.

---

## Three providers, one decision

[`services/paymentService.js`](../backend/src/services/paymentService.js)

```js
activeProvider()  →  'razorpay' | 'stripe' | 'demo'
```

Selection order: `PAYMENT_PROVIDER` if that provider is configured → whichever
single provider has credentials → Stripe if both → `'demo'`.

| Provider | State | Why it exists |
|---|---|---|
| **Razorpay** | complete, needs keys | The right gateway for an India-only product — UPI, rupee settlement. Requires a PAN before issuing even test keys. |
| **Stripe** | complete, needs keys | Test mode normally needs no identity check — but Stripe is invite-only in India. |
| **Demo** | active | No gateway available, so the flow runs and takes no money, saying so on screen. |

`providerWarning()` shouts if a stated preference cannot be honoured, and — checked
first, before any early return — if demo mode is active in production, where a
real visitor could be thanked for a payment that never happened.

---

## The universal flow

Every hosted gateway is the same six steps. Only the vocabulary changes.

```
1. server creates an intent        order (Razorpay) / PaymentIntent (Stripe)
2. provider's UI collects the card  modal / hosted page — never your code
3. provider charges
4. browser callback                 fast, unreliable — the tab can close
5. webhook → your server            slow, guaranteed. THE SOURCE OF TRUTH
6. verify the signature             anyone can POST to a webhook URL
```

### Rule 1 — never trust the client for the amount

Step 1 exists entirely for this. If the browser sent the price, someone would
edit it to ₹1.

### Rule 2 — never trust an unsigned webhook

`/api/donations/webhook` is a public URL. Without the HMAC check, anyone could
POST `{"event":"payment.captured"}` and the fund balance would rise for free.

### Rule 3 — verify over the raw bytes

`JSON.parse` then re-serialise reorders keys and drops whitespace, so the
recomputed HMAC never matches. `app.js` captures `req.rawBody` before the parser
runs, for both webhook paths.

### Rule 4 — webhooks arrive more than once

Providers retry on timeout. Without a guard the same payment is counted three
times:

```js
if (donation.status === 'paid') return res.json({ ok: true, alreadyProcessed: true });
```

---

## Razorpay path

```
POST /api/donations/order   → { provider, donationId, orderId, amountPaise, keyId }
   ↓  browser opens Razorpay's modal with orderId
POST /api/donations/verify  → signature checked → status: 'paid'
POST /api/donations/webhook → backstop, for when the browser never got back
```

### Two writers, not one

`/verify` receives `HMAC_SHA256(orderId|paymentId)` signed with the key secret.
That secret never leaves the server, so the browser cannot forge it, and a valid
signature is proof Razorpay processed *this payment* against *this order*. It is
the check Razorpay's own integration prescribes before showing success, and it
marks the donation paid.

> **This was wrong at first.** `/verify` verified the signature and then
> deliberately did not mark the donation paid, on the reasoning that the webhook
> should be the single writer. That made every donation depend on a webhook
> secret being configured *and* a public URL existing — so a correctly integrated
> gateway took money and recorded nothing, which is exactly what happened in
> development. "Never trust the client" means never trust an **unverified**
> client; it does not mean ignoring a signature you can check.

The webhook still matters, for the one case this path cannot cover: the browser
closing between the payment succeeding and the callback firing. Without it that
payment is taken and never recorded.

Both paths are idempotent — whichever arrives second finds `status: 'paid'` and
returns without touching `paidAt`, so the ledger cannot double-count.

The publishable `keyId` comes from the server in the order response, so it is
never hardcoded into the frontend bundle.

### Razorpay's test-mode simulator

In test mode Razorpay shows its own success/failure chooser after the card
details, so both outcomes can be exercised. It is Razorpay's page, not ours, and
it does not appear in live mode.

---

## Stripe path

```
POST /api/donations/order   → { provider: 'stripe', checkoutUrl }
   ↓  window.location.assign(checkoutUrl) — the donor leaves the site
   ↓  Stripe hosts the card form; no card data touches this app
   ↩  redirect to /donate?status=success&donation=<id>
GET  /api/donations/:id      polled until status === 'paid'
POST /api/donations/stripe/webhook → checkout.session.completed → 'paid'
```

Checkout Sessions rather than Elements: nothing to build, nothing to keep
accessible, and no card data in the bundle.

`client_reference_id` carries the donation id through Stripe and back, so the
webhook ties the event to a row without trusting anything the browser sends.

**The redirect proves nothing** — anyone can type `?status=success`. The return
page therefore reads the real status from the server and polls until the signed
webhook has landed.

Here the webhook really is the only writer, and that is a genuine difference from
Razorpay rather than the same rule applied twice. Razorpay hands the browser a
signed callback that the server can verify on its own; Stripe's redirect carries
no signature, so there is nothing to check and nothing to act on until the
webhook arrives. **The integration decides who can write, not a house style.**

Stripe's SDK `constructEvent` also rejects replayed events on timestamp.

---

## Demo path

```
POST /api/donations/order → { provider: 'demo', demo: true, status: 'paid' }
```

The donation is marked paid in the controller because there is no third party to
hear from. That is the one place demo mode departs from the real flow, and it is
why `provider` is stored on the row — demo donations stay distinguishable from
real ones forever, not just while the server happens to be configured this way.

Labelled in three places: a banner **above the form** (before anyone commits), a
`demo: true` flag in the response, and a thank-you screen that reads *"Demo
donation recorded"* rather than *"Thank you"*.

---

## Validation trap worth knowing

```js
organizationId: z.string().length(24).nullish()   // not .optional()
```

Zod's `.optional()` permits `undefined` and **rejects `null`**. The form holds
`organizationId: null` for a platform-fund donation, and null is a value — it
travels. Every platform-fund donation was rejected before it reached any gateway,
with the useless message *"Validation failed"*.

Two `.refine()` calls also close a related hole: choosing "a specific rescuer"
without picking one would previously have passed validation and been silently
credited to the platform fund — the donor's money going somewhere they did not
choose.

---

## The fund ledger — `GET /api/donations/fund`

```json
{
  "fund": { "raisedInr": 19250, "disbursedInr": 13500, "balanceInr": 5750,
            "donationCount": 5, "disbursementCount": 3 },
  "disbursements": [
    { "amountInr": 6000, "purpose": "surgery",
      "note": "Orthopaedic pinning, road-accident case",
      "organization": { "name": "Paws & Claws Animal Trust" } }
  ]
}
```

Public and unauthenticated. Asking strangers to donate into a pool you control is
only reasonable if where it went is public.

`POST /api/donations/disburse` is admin-only and records money leaving the fund
towards a named organisation and purpose.
