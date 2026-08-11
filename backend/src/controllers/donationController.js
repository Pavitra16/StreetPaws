import { z } from 'zod';
import { Donation, Disbursement, Organization, DogReport } from '../models/index.js';
import {
  createOrder,
  isRazorpayConfigured,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../config/razorpay.js';
import { env } from '../config/env.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const createOrderSchema = z.object({
  // Rupees in, paise stored. A minimum stops accidental ₹0 orders and the
  // fee-heavy long tail of ₹1 donations.
  amountInr: z.coerce.number().min(10, 'Minimum donation is ₹10').max(500000),
  target: z.object({
    type: z.enum(['organization', 'dog', 'platform_fund']),
    organizationId: z.string().length(24).optional(),
    dogReportId: z.string().length(24).optional(),
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
  if (!isRazorpayConfigured()) {
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
  });

  const order = await createOrder({
    amountPaise,
    receipt: `don_${donation.id}`,
    notes: { donationId: donation.id, targetType: b.target.type },
  });

  donation.razorpay.orderId = order.id;
  await donation.save();

  res.status(201).json({
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
 * The browser's word that a payment succeeded. The signature check means a user
 * cannot invent one, but this deliberately does NOT mark the donation paid —
 * only the webhook does. This exists so the thank-you page can show something
 * immediately instead of waiting on Razorpay's callback.
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
  await donation.save();

  res.json({
    ok: true,
    status: donation.status,
    pendingConfirmation: donation.status !== 'paid',
    amountInr: donation.amountInr,
  });
});

/**
 * POST /api/donations/webhook
 *
 * The only place a donation becomes 'paid'. Razorpay signs the raw body with the
 * webhook secret; a browser cannot forge it.
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
