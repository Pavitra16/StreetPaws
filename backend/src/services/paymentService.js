import { env, isProd } from '../config/env.js';
import { isRazorpayConfigured } from '../config/razorpay.js';
import { isStripeConfigured } from '../config/stripe.js';

/**
 * Which payment gateway is active.
 *
 * Both integrations are kept. Razorpay is the correct choice for an India-only
 * product — UPI, rupee settlement, local support — and its code stays complete
 * and readable. Stripe is here because its test mode requires no identity
 * verification, so the donation flow can be demonstrated without submitting a
 * PAN to a payment processor.
 *
 * Selection order:
 *   1. PAYMENT_PROVIDER, if set to a provider that is actually configured
 *   2. whichever single provider has credentials
 *   3. Stripe, if somehow both are configured and no preference was stated
 *   4. 'demo' — no gateway at all
 *
 * Demo mode exists because both gateways are closed to this project right now:
 * Razorpay requires a PAN before issuing even test keys, and Stripe is
 * invite-only in India. It runs the whole donation flow — row created, ledger
 * updated, thank-you page — and takes no money, saying so plainly on screen at
 * every step. It is a way to demonstrate the feature, never a way to pretend a
 * payment happened.
 */
export function activeProvider() {
  const stripe = isStripeConfigured();
  const razorpay = isRazorpayConfigured();

  const preferred = env.paymentProvider?.trim().toLowerCase();
  if (preferred === 'stripe' && stripe) return 'stripe';
  if (preferred === 'razorpay' && razorpay) return 'razorpay';

  if (stripe && !razorpay) return 'stripe';
  if (razorpay && !stripe) return 'razorpay';
  if (stripe && razorpay) return 'stripe';

  return 'demo';
}

/** True when no real gateway is handling money. */
export function isDemoPayments() {
  return activeProvider() === 'demo';
}

/**
 * A stated preference that cannot be honoured is worth saying out loud.
 *
 * Setting PAYMENT_PROVIDER=stripe without STRIPE_SECRET_KEY would otherwise
 * fall through to Razorpay and take real money through the gateway you thought
 * you had switched away from.
 */
export function providerWarning() {
  /**
   * Checked before anything else, because the case it catches is an unset
   * PAYMENT_PROVIDER — a deploy where nobody configured a gateway at all.
   * Demo mode marks donations paid without taking money: locally that is the
   * point, in production it means a real visitor is thanked for nothing.
   */
  if (isProd && activeProvider() === 'demo') {
    return 'DEMO PAYMENTS ARE ACTIVE IN PRODUCTION — donations are recorded as paid but no money is taken';
  }

  /**
   * Razorpay live, but no webhook secret.
   *
   * The checkout callback marks donations paid on its own, so this is not the
   * silent total failure it once was — but the webhook is what catches the
   * payment whose browser closed before the callback fired. Without it that
   * money is taken and never recorded, and nothing anywhere says so.
   */
  if (isProd && activeProvider() === 'razorpay' && !env.razorpay.webhookSecret) {
    return 'RAZORPAY_WEBHOOK_SECRET is not set — payments where the donor closed the tab will be taken but never recorded';
  }

  const preferred = env.paymentProvider?.trim().toLowerCase();
  if (!preferred) return null;
  if (preferred === 'stripe' && !isStripeConfigured()) {
    return 'PAYMENT_PROVIDER=stripe but STRIPE_SECRET_KEY is missing';
  }
  if (preferred === 'razorpay' && !isRazorpayConfigured()) {
    return 'PAYMENT_PROVIDER=razorpay but RAZORPAY_KEY_ID/SECRET are missing';
  }
  if (!['stripe', 'razorpay', 'demo'].includes(preferred)) {
    return `PAYMENT_PROVIDER="${preferred}" is not a known provider`;
  }
  return null;
}
