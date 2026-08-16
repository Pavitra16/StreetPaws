import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * GeoJSON Point. Note the coordinate order is [longitude, latitude] — the
 * opposite of how humans say it and of what Leaflet's setView() wants. Every
 * conversion between the two lives in geo.js helpers so this trap is in one place.
 */
export const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (v) =>
          Array.isArray(v) &&
          v.length === 2 &&
          v[0] >= -180 &&
          v[0] <= 180 &&
          v[1] >= -90 &&
          v[1] <= 90,
        message: 'coordinates must be [longitude, latitude] within valid ranges',
      },
    },
    address: { type: String, trim: true, maxlength: 500 },
    city: { type: String, trim: true, maxlength: 120, index: true },
    state: { type: String, trim: true, maxlength: 120 },
    pincode: { type: String, trim: true, maxlength: 12 },
  },
  { _id: false }
);

export const mediaSchema = new Schema(
  {
    cloudinaryPublicId: { type: String, required: true },
    url: { type: String, required: true },
    thumbnailUrl: String,
    resourceType: { type: String, enum: ['image', 'video'], default: 'image' },
    width: Number,
    height: Number,
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

export const contactSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    preferredChannel: { type: String, enum: ['phone', 'whatsapp', 'email'], default: 'phone' },

    /**
     * The person explicitly asked for these details to be shown publicly.
     *
     * Only an owner posting a lost dog has a reason to tick this: the whole
     * point of their report is that a stranger who spots the dog can call them.
     * Defaults false, so silence never publishes anyone's number.
     */
    showPublicly: { type: Boolean, default: false },
  },
  { _id: false }
);

/** Strips __v and renames _id to id so the API never leaks Mongo-isms. */
export const jsonTransform = {
  virtuals: true,
  versionKey: false,
  transform(doc, ret) {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
};

export const baseOptions = {
  timestamps: true,
  toJSON: jsonTransform,
  toObject: jsonTransform,
};
