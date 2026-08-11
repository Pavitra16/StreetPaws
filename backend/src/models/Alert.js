import mongoose from 'mongoose';
import { baseOptions } from './shared.js';

const { Schema } = mongoose;

/**
 * One row per (report, organization) notification. This is the audit trail for
 * routing — and the raw data behind Organization.responseStats, which is what
 * would eventually let routing learn who actually turns up.
 */
const alertSchema = new Schema(
  {
    dogReportId: { type: Schema.Types.ObjectId, ref: 'DogReport', required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

    distanceKm: Number,
    // Routing rank score at send time, kept so a bad ranking can be diagnosed later.
    routingScore: Number,
    urgency: { type: Number, min: 1, max: 5 },

    channel: { type: String, enum: ['email', 'sms', 'whatsapp', 'in_app'], default: 'in_app' },
    status: {
      type: String,
      enum: ['sent', 'viewed', 'accepted', 'declined', 'expired', 'failed'],
      default: 'sent',
      index: true,
    },
    declineReason: { type: String, maxlength: 500 },
    error: String,

    sentAt: { type: Date, default: Date.now },
    viewedAt: Date,
    respondedAt: Date,
  },
  baseOptions
);

// An org must not be alerted twice for the same report.
alertSchema.index({ dogReportId: 1, organizationId: 1 }, { unique: true });
alertSchema.index({ organizationId: 1, status: 1, sentAt: -1 });

alertSchema.virtual('responseMinutes').get(function () {
  if (!this.respondedAt || !this.sentAt) return null;
  return Math.round((this.respondedAt - this.sentAt) / 60000);
});

export const Alert = mongoose.model('Alert', alertSchema);
