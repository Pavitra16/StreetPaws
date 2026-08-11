import mongoose from 'mongoose';
import { baseOptions, mediaSchema, pointSchema } from './shared.js';

const { Schema } = mongoose;

const adoptionListingSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

    name: { type: String, required: true, trim: true, maxlength: 80 },
    story: { type: String, trim: true, maxlength: 3000 },
    media: {
      type: [mediaSchema],
      validate: { validator: (v) => v.length > 0, message: 'At least one photo is required' },
    },

    breed: { type: String, trim: true, maxlength: 120, index: true },
    ageMonths: { type: Number, min: 0, max: 300 },
    sex: { type: String, enum: ['male', 'female', 'unknown'], default: 'unknown' },
    size: { type: String, enum: ['small', 'medium', 'large'], default: 'medium', index: true },

    vaccinated: { type: Boolean, default: false },
    sterilized: { type: Boolean, default: false },
    specialNeeds: { type: String, trim: true, maxlength: 1000 },

    temperament: [{ type: String, enum: ['calm', 'playful', 'shy', 'protective', 'energetic', 'affectionate'] }],
    goodWith: {
      kids: { type: Boolean, default: null },
      dogs: { type: Boolean, default: null },
      cats: { type: Boolean, default: null },
    },

    adoptionFee: { type: Number, default: 0, min: 0 },

    // Denormalised from the organisation so "adoptable dogs near me" is one query.
    location: { type: pointSchema, required: true },

    status: {
      type: String,
      enum: ['available', 'pending', 'adopted', 'withdrawn'],
      default: 'available',
      index: true,
    },

    // Set when a rescued street dog graduates into an adoption listing.
    sourceReportId: { type: Schema.Types.ObjectId, ref: 'DogReport', default: null },
  },
  baseOptions
);

adoptionListingSchema.index({ location: '2dsphere' });
adoptionListingSchema.index({ status: 1, createdAt: -1 });

adoptionListingSchema.virtual('primaryMedia').get(function () {
  if (!this.media?.length) return null;
  return this.media.find((m) => m.isPrimary) ?? this.media[0];
});

export const AdoptionListing = mongoose.model('AdoptionListing', adoptionListingSchema);
