import crypto from 'node:crypto';
import { env, featureStatus } from './env.js';

/**
 * Razorpay without the SDK — the two calls we need are a POST to create an order
 * and two HMAC checks. Adding a dependency for that is not worth it, and doing
 * the signature verification by hand makes it obvious what is being verified.
 */

const API = 'https://api.razorpay.com/v1';

export function isRazorpayConfigured() {
  return featureStatus().razorpay;
}

function authHeader() {
  const token = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64');
  return `Basic ${token}`;
}

export async function createOrder({ amountPaise, currency = 'INR', receipt, notes }) {
  const res = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'content-type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency, receipt, notes, payment_capture: 1 }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.description ?? `Razorpay order failed (${res.status})`);
  }
  return body;
}

/**
 * Verifies the checkout callback the BROWSER hands back.
 *
 * This proves the browser is not making the payment up, but it is not proof of
 * payment on its own — the browser is not a trusted source. The webhook below is
 * what actually marks a donation paid.
 */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return timingSafeEqual(expected, signature);
}

/** Verifies a webhook using the raw request body — re-serialised JSON will not match. */
export function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // crypto.timingSafeEqual throws on length mismatch, which would itself leak
  // information — compare lengths first, then constant-time compare.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
