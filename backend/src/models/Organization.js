import mongoose from 'mongoose';
import { baseOptions, pointSchema } from './shared.js';

const { Schema } = mongoose;

/**
 * NGOs and individual rescuers share one collection, separated by `kind`.
 * They behave identically for routing purposes — both receive alerts, accept
 * cases, and can list dogs for adoption — so splitting them would mean
 * duplicating every query.
 */
const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    kind: { type: String, enum: ['ngo', 'private_helper'], required: true, index: true },
    description: { type: String, trim: true, maxlength: 2000 },

    location: { type: pointSchema, required: true },
    serviceRadiusKm: { type: Number, default: 10, min: 1, max: 100 },

    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    website: { type: String, trim: true, maxlength: 300 },

    // How many active cases they can hold at once; routing skips them when full.
    capacity: { type: Number, default: 5, min: 0 },
    activeCaseCount: { type: Number, default: 0, min: 0 },

    specializations: [
      {
        type: String,
        enum: ['injury', 'surgery', 'skin_disease', 'puppies', 'sterilization', 'rabies', 'shelter', 'transport'],
      },
    ],

    /**
     * Application lifecycle. Only 'approved' organisations receive alerts, hold
     * cases, list dogs for adoption, or appear as a donation target — an
     * unreviewed applicant must not be able to collect money or see reporters.
     */
    applicationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
      index: true,
    },
    reviewedAt: Date,
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNote: { type: String, trim: true, maxlength: 1000 },

    /**
     * PAN — the identity key for organisations.
     *
     * No single NGO registration number works for this: society and trust
     * numbers are issued per state, so two unrelated NGOs in different states
     * can legitimately hold the same one. Only Section 8 companies get a
     * nationally unique CIN, and NGO Darpan IDs exist only for organisations
     * that registered on that portal.
     *
     * Every registered entity that files tax has a PAN, it is nationally
     * unique, and its format is checkable. Stored uppercase so the unique index
     * cannot be sidestepped with different casing.
     */
    pan: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid 10-character PAN, e.g. AABCT1234H'],
    },

    // Free text for the admin to eyeball — state-scoped, so not a uniqueness key.
    registrationNumber: { type: String, trim: true, maxlength: 120 },
    // Optional but a strong signal: nationally unique and independently checkable.
    darpanId: { type: String, trim: true, uppercase: true, maxlength: 40 },
    contactPersonName: { type: String, trim: true, maxlength: 120 },
    yearsActive: { type: Number, min: 0, max: 100 },

    // The login account that owns this organisation, created on approval.
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Verified organisations may see reporter contact details (middleware/auth.js).
    // Approval and verification are separate: approval lets you work, verification
    // grants access to personal data.
    verified: { type: Boolean, default: false, index: true },
    active: { type: Boolean, default: true, index: true },

    responseStats: {
      assigned: { type: Number, default: 0 },
      accepted: { type: Number, default: 0 },
      resolved: { type: Number, default: 0 },
      avgResponseMinutes: { type: Number, default: null },
    },
  },
  baseOptions
);

organizationSchema.index({ location: '2dsphere' });
organizationSchema.index({ kind: 1, active: 1, verified: 1 });
organizationSchema.index({ applicationStatus: 1, createdAt: -1 });

/**
 * At most one live organisation per email address.
 *
 * The application controller already checks for an existing record, but a
 * check-then-insert has a race: two applications submitted at the same instant
 * both see "no existing record" and both succeed. Only the database can settle
 * that, so the constraint belongs here.
 *
 * Deliberately partial. A rejected or suspended record stays in the data as
 * history, and a rejected applicant may reapply — what must never exist twice
 * is an organisation that can currently receive reports.
 */
organizationSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { applicationStatus: { $in: ['pending', 'approved'] } },
    name: 'unique_live_email',
  }
);

// One live organisation per PAN. Partial on `$exists` as well as status, so the
// many private helpers with no PAN do not all collide on null.
organizationSchema.index(
  { pan: 1 },
  {
    unique: true,
    partialFilterExpression: {
      pan: { $exists: true, $type: 'string' },
      applicationStatus: { $in: ['pending', 'approved'] },
    },
    name: 'unique_live_pan',
  }
);

// Individuals have no PAN we can reasonably demand, so their phone number is
// the identity key. Same partial-index reasoning.
organizationSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phone: { $exists: true, $type: 'string' },
      applicationStatus: { $in: ['pending', 'approved'] },
    },
    name: 'unique_live_phone',
  }
);

/** The single condition for "may operate on the platform". */
organizationSchema.statics.operationalFilter = function () {
  return { applicationStatus: 'approved', active: true };
};

organizationSchema.virtual('hasCapacity').get(function () {
  return this.activeCaseCount < this.capacity;
});

/** Share of alerts this org actually accepted — feeds routing rank later. */
organizationSchema.virtual('acceptanceRate').get(function () {
  const { assigned, accepted } = this.responseStats ?? {};
  if (!assigned) return null;
  return accepted / assigned;
});

export const Organization = mongoose.model('Organization', organizationSchema);
