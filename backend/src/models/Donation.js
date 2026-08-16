import mongoose from 'mongoose';
import { baseOptions } from './shared.js';

const { Schema } = mongoose;

const donationSchema = new Schema(
  {
    // Stored in paise (the smallest unit) because that is what Razorpay works in,
    // and because floats are the wrong type for money.
    amountPaise: { type: Number, required: true, min: 100 },
    currency: { type: String, default: 'INR' },

    donor: {
      name: { type: String, trim: true, maxlength: 120 },
      email: { type: String, trim: true, lowercase: true, maxlength: 200 },
      phone: { type: String, trim: true, maxlength: 20 },
      anonymous: { type: Boolean, default: false },
    },

    target: {
      type: {
        type: String,
        enum: ['organization', 'dog', 'platform_fund'],
        required: true,
        index: true,
      },
      organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
      dogReportId: { type: Schema.Types.ObjectId, ref: 'DogReport', default: null },
    },

    /**
     * Which gateway took this payment.
     *
     * Recorded per donation, not read from configuration at display time. A
     * refund, a dispute or a reconciliation months later has to go back to the
     * provider that actually holds the money, and by then the server may well
     * be pointed at the other one.
     */
    provider: { type: String, enum: ['razorpay', 'stripe', 'demo'], default: 'razorpay', index: true },

    razorpay: {
      orderId: { type: String, index: true },
      paymentId: String,
      signature: String,
    },

    stripe: {
      // The Checkout Session — created before payment, so it is what a webhook
      // arriving for an abandoned payment can still be matched against.
      sessionId: { type: String, index: true },
      paymentIntentId: String,
    },

    // Only ever moved to 'paid' by the signature-verified webhook — never by the
    // browser callback, which a user can forge.
    status: {
      type: String,
      enum: ['created', 'paid', 'failed', 'refunded'],
      default: 'created',
      index: true,
    },
    paidAt: Date,
    failureReason: String,
    message: { type: String, trim: true, maxlength: 500 },
  },
  baseOptions
);

donationSchema.index({ status: 1, createdAt: -1 });

donationSchema.virtual('amountInr').get(function () {
  return this.amountPaise / 100;
});

export const Donation = mongoose.model('Donation', donationSchema);
