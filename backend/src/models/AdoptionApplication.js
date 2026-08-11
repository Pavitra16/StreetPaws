import mongoose from 'mongoose';
import { baseOptions, contactSchema } from './shared.js';

const { Schema } = mongoose;

const adoptionApplicationSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, ref: 'AdoptionListing', required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

    applicant: { type: contactSchema, required: true },
    city: { type: String, trim: true, maxlength: 120 },

    homeType: { type: String, enum: ['apartment', 'independent_house', 'farm', 'other'] },
    hasOutdoorSpace: { type: Boolean, default: false },
    hasOtherPets: { type: Boolean, default: false },
    otherPetsDetail: { type: String, trim: true, maxlength: 500 },
    householdAdults: { type: Number, min: 0, max: 50 },
    hasChildren: { type: Boolean, default: false },

    experience: { type: String, trim: true, maxlength: 2000 },
    reason: { type: String, trim: true, maxlength: 2000 },

    status: {
      type: String,
      enum: ['submitted', 'reviewing', 'approved', 'rejected', 'withdrawn'],
      default: 'submitted',
      index: true,
    },
    reviewNote: { type: String, trim: true, maxlength: 2000 },
    reviewedAt: Date,
  },
  baseOptions
);

adoptionApplicationSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const AdoptionApplication = mongoose.model('AdoptionApplication', adoptionApplicationSchema);
