import { z } from 'zod';
import { Donation, Disbursement, Organization, DogReport } from '../models/index.js';
import {
  createOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../config/razorpay.js';
import { createCheckoutSession, constructWebhookEvent } from '../config/stripe.js';
import { activeProvider } from '../services/paymentService.js';
import { env } from '../config/env.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const createOrderSchema = z.object({
  // Rupees in, paise stored. A minimum stops accidental ₹0 orders and the
  // fee-heavy long tail of ₹1 donations.
  amountInr: z.coerce.number().min(10, 'Minimum donation is ₹10').max(500000),
  /**
   * The two id fields are nullable, not merely optional.
   *
   * Zod's .optional() permits `undefined` and rejects `null`, but "no
   * organisation selected" is a real, held value in the form's state and
   * serialises as null. Requiring the client to strip its own nulls before
   * every request is a rule that will be forgotten — and was: a donation to
   * the platform fund failed validation before it ever reached Razorpay.
   */
  target: z.object({
    type: z.enum(['organization', 'dog', 'platform_fund']),
    organizationId: z.string().length(24).nullish(),
    dogReportId: z.string().length(24).nullish(),
  })
    // A targeted donation without a target would be accepted and then quietly
    // credited to the fund, which is not what the donor chose.
    .refine((t) => t.type !== 'organization' || Boolean(t.organizationId), {
      message: 'Choose which rescuer to donate to',
      path: ['organizationId'],
    })
    .refine((t) => t.type !== 'dog' || Boolean(t.dogReportId), {
      message: 'Choose which dog to donate to',
      path: ['dogReportId'],
    }),
  donor: z.object({
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().email().max(200).optional().or(z.literal('')),
    phone: z.string().trim().max(20).optional(),
    anonymous: z.boolean().default(false),
  }),
  message: z.string().trim().max(500).optional(),
});

/** POST /api/donations/order */
export const createDonationOrder = asyncHandler(async (req, res) => {
  const provider = activeProvider();
  if (!provider) {
    throw ApiError.unavailable('Donations are not configured on this server yet.');
  }

  const b = req.body;
  const amountPaise = Math.round(b.amountInr * 100);

  // A donation may only ever be directed at an approved organisation. Without
  // this check anyone could create a pending org and collect money through us.
  let organization = null;
  if (b.target.type === 'organization') {
    if (!b.target.organizationId) throw ApiError.badRequest('Choose an organisation to donate to');
    organization = await Organization.findOne({
      _id: b.target.organizationId,
      ...Organization.operationalFilter(),
    });
    if (!organization) throw ApiError.badRequest('That organisation is not accepting donations');
  }

  if (b.target.type === 'dog') {
    if (!b.target.dogReportId) throw ApiError.badRequest('Choose a dog to donate towards');
    const report = await DogReport.findById(b.target.dogReportId);
    if (!report) throw ApiError.notFound('That report no longer exists');
  }

  const donation = await Donation.create({
    amountPaise,
    currency: 'INR',
    donor: { ...b.donor, email: b.donor.email || undefined },
    target: {
      type: b.target.type,
      organizationId: organization?._id ?? null,
      dogReportId: b.target.type === 'dog' ? b.target.dogReportId : null,
    },
    message: b.message,
    status: 'created',
    provider,
  });

  const label =
    b.target.type === 'platform_fund'
      ? 'StreetPaws street dog treatment fund'
      : organization
        ? `Donation to ${organization.name}`
        : 'Donation towards one dog’s treatment';

  /**
   * The two gateways hand the browser different things, and the client is told
   * which so it does not have to guess:
   *
   *   stripe   — a hosted page to send the donor to. No card UI here at all.
   *   razorpay — an order id the checkout modal opens against.
   */
  /**
   * Demo mode: no gateway, no money, and the response says so.
   *
   * The donation is marked paid here rather than by a webhook because there is
   * no third party to hear from. That is the one place demo mode departs from
   * the real flow, and it is why `provider` is stored on the row — these are
   * distinguishable from real payments forever, not just while the server
   * happens to be configured this way.
   */
  if (provider === 'demo') {
    donation.status = 'paid';
    donation.paidAt = new Date();
    await donation.save();

    return res.status(201).json({
      provider: 'demo',
      demo: true,
      donationId: donation.id,
      amountPaise,
      currency: 'INR',
      status: 'paid',
      message: 'Demo mode — no payment was taken.',
    });
  }

  if (provider === 'stripe') {
    const session = await createCheckoutSession({
      amountPaise,
      donationId: donation.id,
      description: label,
      donorEmail: b.donor.email,
      successUrl: `${env.clientOrigin}/donate?status=success&donation=${donation.id}`,
      cancelUrl: `${env.clientOrigin}/donate?status=cancelled`,
    });

    donation.stripe.sessionId = session.id;
    await donation.save();

    return res.status(201).json({
      provider: 'stripe',
      donationId: donation.id,
      amountPaise,
      currency: 'INR',
      checkoutUrl: session.url,
    });
  }

  const order = await createOrder({
    amountPaise,
    receipt: `don_${donation.id}`,
    notes: { donationId: donation.id, targetType: b.target.type },
  });

  donation.razorpay.orderId = order.id;
  await donation.save();

  res.status(201).json({
    provider: 'razorpay',
    donationId: donation.id,
    orderId: order.id,
    amountPaise,
    currency: 'INR',
    // Publishable key — safe in the browser, unlike the secret.
    keyId: env.razorpay.keyId,
  });
});

export const verifySchema = z.object({
  donationId: z.string().length(24),
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

/**
 * POST /api/donations/verify
 *
 * Razorpay's checkout callback, and one of the two places a donation becomes
 * paid.
 *
 * The signature here is HMAC_SHA256(orderId|paymentId) under the key secret,
 * which never leaves this server — so a browser cannot forge it, and a valid one
 * is proof that Razorpay processed this payment against this order. That is
 * exactly the check Razorpay's own integration prescribes before showing
 * success.
 *
 * This used to verify the signature and then deliberately not mark the donation
 * paid, on the reasoning that the webhook should be the single writer. That was
 * too strict: it made every donation depend on a webhook secret being configured
 * and a public URL existing, so a correctly integrated gateway would take money
 * and record nothing. "Never trust the client" means never trust an *unverified*
 * client — not ignoring a signature we can check.
 *
 * The webhook remains the backstop, for the case this path cannot cover: the
 * browser closing between payment and callback. Both are idempotent, so whichever
 * arrives second is a no-op.
 */
export const verifyDonation = asyncHandler(async (req, res) => {
  const { donationId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  const donation = await Donation.findById(donationId);
  if (!donation) throw ApiError.notFound('Donation not found');
  if (donation.razorpay.orderId !== razorpayOrderId) {
    throw ApiError.badRequest('This payment does not match the donation');
  }

  const valid = verifyCheckoutSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });
  if (!valid) throw ApiError.badRequest('Payment signature could not be verified');

  donation.razorpay.paymentId = razorpayPaymentId;
  donation.razorpay.signature = razorpaySignature;

  // Idempotent: the webhook may have got here first, and re-marking a paid
  // donation would move paidAt and misreport when the money actually arrived.
  if (donation.status !== 'paid') {
    donation.status = 'paid';
    donation.paidAt = new Date();
    console.log(`[donation] ${donation.id} paid ₹${donation.amountInr} (checkout callback)`);
  }

  await donation.save();

  res.json({
    ok: true,
    status: donation.status,
    amountInr: donation.amountInr,
    amountPaise: donation.amountPaise,
  });
});

/**
 * POST /api/donations/webhook
 *
 * The backstop behind /verify, for the payment whose browser never came back —
 * tab closed, connection dropped, phone died between paying and the callback.
 * Without this, that money is taken and never recorded.
 *
 * Razorpay signs the raw body with the webhook secret, so a browser cannot forge
 * it. Idempotent against /verify: whichever arrives second finds 'paid' and
 * returns without moving paidAt.
 */
export const donationWebhook = asyncHandler(async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  const raw = req.rawBody;

  if (!raw || !verifyWebhookSignature(raw, signature)) {
    // Deliberately terse — an attacker probing this should learn nothing.
    return res.status(400).json({ error: { message: 'Invalid signature' } });
  }

  const event = JSON.parse(raw.toString('utf8'));
  const payment = event?.payload?.payment?.entity;
  const orderId = payment?.order_id;

  if (!orderId) return res.json({ ok: true, ignored: true });

  const donation = await Donation.findOne({ 'razorpay.orderId': orderId });
  if (!donation) return res.json({ ok: true, unknownOrder: true });

  // Webhooks are delivered at-least-once; re-processing must be harmless.
  if (donation.status === 'paid') return res.json({ ok: true, alreadyProcessed: true });

  if (event.event === 'payment.captured') {
    donation.status = 'paid';
    donation.paidAt = new Date();
    donation.razorpay.paymentId = payment.id;
    await donation.save();
    console.log(`[donation] ${donation.id} paid ₹${donation.amountInr}`);
  } else if (event.event === 'payment.failed') {
    donation.status = 'failed';
    donation.failureReason = payment.error_description?.slice(0, 300);
    await donation.save();
  }

  res.json({ ok: true });
});

/**
 * GET /api/donations/fund
 *
 * Public ledger. If you ask strangers to donate into a pool you control, showing
 * where the money went is not optional.
 */
export const fundSummary = asyncHandler(async (req, res) => {
  const [raised, disbursed, recentDisbursements, topOrgs] = await Promise.all([
    Donation.aggregate([
      { $match: { status: 'paid', 'target.type': 'platform_fund' } },
      { $group: { _id: null, total: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
    ]),
    Disbursement.aggregate([{ $group: { _id: null, total: { $sum: '$amountPaise' }, count: { $sum: 1 } } }]),
    Disbursement.find().sort({ disbursedAt: -1 }).limit(20).populate('organizationId', 'name kind'),
    Donation.aggregate([
      { $match: { status: 'paid', 'target.type': 'organization' } },
      { $group: { _id: '$target.organizationId', total: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const raisedPaise = raised[0]?.total ?? 0;
  const disbursedPaise = disbursed[0]?.total ?? 0;

  res.json({
    fund: {
      raisedInr: raisedPaise / 100,
      disbursedInr: disbursedPaise / 100,
      balanceInr: (raisedPaise - disbursedPaise) / 100,
      donationCount: raised[0]?.count ?? 0,
      disbursementCount: disbursed[0]?.count ?? 0,
    },
    disbursements: recentDisbursements.map((d) => ({
      id: d.id,
      amountInr: d.amountInr,
      purpose: d.purpose,
      note: d.note,
      disbursedAt: d.disbursedAt,
      organization: d.organizationId ? { id: d.organizationId.id, name: d.organizationId.name } : null,
    })),
    directToOrganizations: topOrgs.map((o) => ({
      organizationId: o._id,
      totalInr: o.total / 100,
      count: o.count,
    })),
  });
});

export const disbursementSchema = z.object({
  organizationId: z.string().length(24),
  amountInr: z.coerce.number().min(1).max(500000),
  purpose: z.enum(['treatment', 'surgery', 'food', 'transport', 'sterilization', 'shelter', 'other']),
  note: z.string().trim().max(1000).optional(),
  dogReportId: z.string().length(24).optional(),
  referenceNumber: z.string().trim().max(120).optional(),
});

/** POST /api/donations/disburse — admin records money paid out of the fund. */
export const recordDisbursement = asyncHandler(async (req, res) => {
  const b = req.body;

  const org = await Organization.findOne({
    _id: b.organizationId,
    ...Organization.operationalFilter(),
  });
  if (!org) throw ApiError.badRequest('That organisation is not approved');

  const [raised, disbursed] = await Promise.all([
    Donation.aggregate([
      { $match: { status: 'paid', 'target.type': 'platform_fund' } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]),
    Disbursement.aggregate([{ $group: { _id: null, total: { $sum: '$amountPaise' } } }]),
  ]);

  const balance = (raised[0]?.total ?? 0) - (disbursed[0]?.total ?? 0);
  const amountPaise = Math.round(b.amountInr * 100);
  if (amountPaise > balance) {
    throw ApiError.badRequest(
      `The fund holds ₹${(balance / 100).toFixed(2)} — you cannot disburse more than that`
    );
  }

  const disbursement = await Disbursement.create({
    organizationId: org._id,
    amountPaise,
    purpose: b.purpose,
    note: b.note,
    dogReportId: b.dogReportId,
    referenceNumber: b.referenceNumber,
    recordedByUserId: req.user.id,
  });

  res.status(201).json(disbursement.toJSON());
});

/**
 * POST /api/donations/stripe/webhook
 *
 * The Stripe equivalent of donationWebhook, and the only place a Stripe
 * donation becomes 'paid'. Same three properties as the Razorpay one, for the
 * same reasons:
 *
 *   - verified against the RAW bytes (constructEvent also rejects a replay)
 *   - idempotent, because webhooks are delivered at least once
 *   - terse on failure, so probing it teaches nothing
 */
export const stripeWebhook = asyncHandler(async (req, res) => {
  const signature = req.get('stripe-signature');
  const raw = req.rawBody;

  let event;
  try {
    event = constructWebhookEvent(raw, signature);
  } catch {
    return res.status(400).json({ error: { message: 'Invalid signature' } });
  }

  const session = event.data?.object;
  // client_reference_id is ours, set when the session was created — it does not
  // come from the browser, so it can be trusted to identify the row.
  const donationId = session?.client_reference_id ?? session?.metadata?.donationId;
  if (!donationId) return res.json({ ok: true, ignored: true });

  const donation = await Donation.findById(donationId).catch(() => null);
  if (!donation) return res.json({ ok: true, unknownDonation: true });
  if (donation.status === 'paid') return res.json({ ok: true, alreadyProcessed: true });

  if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
    donation.status = 'paid';
    donation.paidAt = new Date();
    donation.stripe.paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : null;
    await donation.save();
    console.log(`[donation] ${donation.id} paid ₹${donation.amountInr} via stripe`);
  } else if (
    event.type === 'checkout.session.expired' ||
    event.type === 'checkout.session.async_payment_failed'
  ) {
    donation.status = 'failed';
    donation.failureReason =
      event.type === 'checkout.session.expired' ? 'Checkout expired' : 'Payment failed';
    await donation.save();
  }

  res.json({ ok: true });
});

/**
 * GET /api/donations/:id
 *
 * Lets the thank-you page show the real state after Stripe redirects the donor
 * back. Stripe has no browser-side signature to verify — the redirect proves
 * nothing — so the page polls this and the webhook remains the only writer.
 */
export const getDonation = asyncHandler(async (req, res) => {
  const donation = await Donation.findById(req.params.id);
  if (!donation) throw ApiError.notFound('Donation not found');

  // Deliberately narrow: this endpoint is unauthenticated, reachable by anyone
  // holding an id, and the donor's name, email and message are none of their
  // business.
  res.json({
    id: donation.id,
    status: donation.status,
    amountInr: donation.amountInr,
    provider: donation.provider,
    paidAt: donation.paidAt ?? null,
  });
});
