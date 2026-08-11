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

    razorpay: {
      orderId: { type: String, index: true },
      paymentId: String,
      signature: String,
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
