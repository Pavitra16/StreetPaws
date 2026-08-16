import mongoose from 'mongoose';
import { baseOptions, contactSchema, mediaSchema, pointSchema } from './shared.js';

const { Schema } = mongoose;

/**
 * Someone saw a lost dog somewhere.
 *
 * Deliberately NOT a DogReport with a link field, which was the obvious reuse:
 * creating a DogReport runs the analysis job, which fans out to every rescuer in
 * range. A sighting of a healthy pet that is already being looked for should not
 * page an NGO and consume a capacity slot — the owner is the one who needs to
 * know, and they are already looking.
 *
 * So a sighting carries no condition, no urgency, no status workflow and no
 * assignment. It is an observation: a pin, a time, and optionally a photo.
 */
const sightingSchema = new Schema(
  {
    dogReportId: {
      type: Schema.Types.ObjectId,
      ref: 'DogReport',
      required: true,
      index: true,
    },

    location: { type: pointSchema, required: true },
    seenAt: { type: Date, required: true, default: Date.now },
    note: { type: String, trim: true, maxlength: 1000 },

    // Optional: a photo settles "is that actually my dog" faster than any text.
    media: { type: [mediaSchema], default: [] },

    // Optional too. Requiring a phone number to say "I saw your dog by the metro"
    // loses the sighting from anyone unwilling to hand theirs over, and a pin on
    // a map is worth having on its own.
    contact: { type: contactSchema, default: undefined },
  },
  baseOptions
);

// The lost dog's page lists its sightings newest first, and that is the only
// query this collection serves.
sightingSchema.index({ dogReportId: 1, seenAt: -1 });
sightingSchema.index({ location: '2dsphere' });

export const Sighting = mongoose.model('Sighting', sightingSchema);
