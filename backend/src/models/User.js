import mongoose from 'mongoose';
import { baseOptions } from './shared.js';

const { Schema } = mongoose;

/**
 * Present but unused until the auth step. Reports currently carry a `contact`
 * sub-document instead, so a passer-by can report a dog without signing up —
 * which is the whole point: friction here costs an animal.
 */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, maxlength: 20 },
    role: {
      type: String,
      enum: ['reporter', 'ngo', 'helper', 'admin'],
      default: 'reporter',
      index: true,
    },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },

    // select:false so a stray User.find() can never serialise a hash into a
    // response. Every read that needs it must ask for it explicitly.
    passwordHash: { type: String, select: false },

    active: { type: Boolean, default: true },
    lastLoginAt: Date,

    // Forces a password change on first login for admin-issued accounts.
    mustChangePassword: { type: Boolean, default: false },

    /**
     * Only the SHA-256 of the reset token is stored. Someone who reads the
     * database still cannot reset anyone's password — they would need the raw
     * token, which exists only in the email we sent.
     */
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },

    /**
     * Any session token issued before this moment is refused. Without it, a
     * password reset would not evict whoever was already signed in — which is
     * the entire point of resetting a password you think is compromised.
     */
    passwordChangedAt: { type: Date, default: null },
  },
  baseOptions
);

// Defence in depth: even if a query selects the hash, it must not leave the API.
userSchema.set('toJSON', {
  ...baseOptions.toJSON,
  transform(doc, ret) {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.passwordHash;
    delete ret.passwordResetTokenHash;
    delete ret.passwordResetExpiresAt;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
