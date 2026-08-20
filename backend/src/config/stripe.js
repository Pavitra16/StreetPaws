import Stripe from 'stripe';
import { env } from './env.js';

/**
 * Stripe, as an alternative to Razorpay.
 *
 * Both providers stay in the codebase and either can be active — see
 * services/paymentService.js for how one is chosen. Razorpay is the right
 * gateway for an India-only product (UPI, rupee settlement, local support);
 * Stripe is here because its test mode needs no identity verification, so the
 * donation flow can be demonstrated end to end without handing a PAN to a
 * payment processor.
 *
 * Checkout Sessions rather than Payment Intents + Elements: the card form is
 * hosted by Stripe, so no card data touches this application or the browser
 * bundle, and there is no card UI to build or keep accessible.
 */
let client = null;

export function stripeClient() {
  if (!client) {
    if (!env.stripe.secretKey) throw new Error('Stripe is not configured');
    client = new Stripe(env.stripe.secretKey);
  }
  return client;
}

export function isStripeConfigured() {
  return Boolean(env.stripe.secretKey);
}

/**
 * Creates the hosted payment page for one donation.
 *
 * `client_reference_id` carries our donation id through Stripe and back on the
 * webhook, so the event can be tied to a row without trusting anything the
 * browser sends on return.
 */
export async function createCheckoutSession({
  amountPaise,
  donationId,
  description,
  donorEmail,
  successUrl,
  cancelUrl,
}) {
  return stripeClient().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'inr',
          // Stripe also counts in the smallest unit, so paise passes straight
          // through — no conversion, and no float to round wrongly.
          unit_amount: amountPaise,
          product_data: { name: description },
        },
        quantity: 1,
      },
    ],
    client_reference_id: donationId,
    customer_email: donorEmail || undefined,
    metadata: { donationId },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

/**
 * Verifies a webhook against the raw request bytes.
 *
 * Stripe's SDK does the HMAC and the timestamp-tolerance check, which also
 * rejects a replayed event. Throws on failure — the caller turns that into a
 * 400 without echoing the reason back to whoever sent it.
 */
export function constructWebhookEvent(rawBody, signature) {
  return stripeClient().webhooks.constructEvent(rawBody, signature, env.stripe.webhookSecret);
}
