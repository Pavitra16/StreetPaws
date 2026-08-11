import mongoose from 'mongoose';
import { baseOptions } from './shared.js';

const { Schema } = mongoose;

/**
 * Money paid out of the platform fund to an organisation. Every disbursement is
 * public: if you ask strangers to donate into a pool you control, the ledger
 * showing where it went is not optional.
 */
const disbursementSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR' },

    purpose: {
      type: String,
      enum: ['treatment', 'surgery', 'food', 'transport', 'sterilization', 'shelter', 'other'],
      required: true,
    },
    note: { type: String, trim: true, maxlength: 1000 },

    dogReportId: { type: Schema.Types.ObjectId, ref: 'DogReport', default: null },
    referenceNumber: { type: String, trim: true, maxlength: 120 },

    disbursedAt: { type: Date, default: Date.now, index: true },
    recordedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  baseOptions
);

disbursementSchema.virtual('amountInr').get(function () {
  return this.amountPaise / 100;
});

export const Disbursement = mongoose.model('Disbursement', disbursementSchema);
