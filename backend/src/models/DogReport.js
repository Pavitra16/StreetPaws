import mongoose from 'mongoose';
import { baseOptions, contactSchema, mediaSchema, pointSchema } from './shared.js';

const { Schema } = mongoose;

export const REPORT_KINDS = ['found', 'lost'];
export const CONDITIONS = ['healthy', 'injured', 'sick', 'critical'];
export const REPORT_STATUSES = [
  'open',
  'assigned',
  'in_treatment',
  'resolved',
  'reunited',
  'closed',
];

/**
 * A case that is finished. Nobody should be searching for these dogs, alerting
 * on them, or reporting sightings of them.
 *
 * Defined once here because three places need the same answer and had been
 * deciding it independently — which is how a reunited dog stayed in the search
 * results and kept collecting sightings after it was home.
 */
export const CLOSED_STATUSES = ['resolved', 'reunited', 'closed'];
export const ACTIVE_STATUSES = REPORT_STATUSES.filter((s) => !CLOSED_STATUSES.includes(s));

/** What the reporter's own condition pick is worth on the 1-5 urgency scale. */
export const CONDITION_URGENCY = { critical: 5, injured: 4, sick: 3, healthy: 1 };

/**
 * The number that actually orders the rescuer queue.
 *
 * Deliberately the MAXIMUM of the model's read and the reporter's own pick, never
 * just the model's. The person is standing in front of the animal; the model is
 * looking at one photo that may not show the wound. A model that scores 1 on a
 * dog someone flagged as critical must not be able to bury it in the queue.
 * The reverse is fine — the model raising urgency on a report someone
 * under-called costs a rescuer one extra look.
 */
export function computeEffectiveUrgency({ aiUrgency, condition }) {
  const fromReporter = CONDITION_URGENCY[condition] ?? 1;
  const fromModel = Number.isFinite(aiUrgency) ? aiUrgency : 0;
  return Math.max(fromReporter, fromModel);
}

/**
 * Written by the Gemini vision pass. Kept nullable because a report is saved and
 * returned to the reporter *before* analysis runs — see jobs/analyzeReport.js.
 */
const aiAnalysisSchema = new Schema(
  {
    // False when the vision pass could not find a dog in the photo — surfaced to
    // the reporter so they can re-upload rather than the report sitting unactionable.
    isDog: { type: Boolean, default: true },
    breed: String,
    breedConfidence: { type: Number, min: 0, max: 1 },
    colors: [String],
    coatPattern: String,
    sizeEstimate: { type: String, enum: ['small', 'medium', 'large', 'unknown'] },
    ageEstimate: { type: String, enum: ['puppy', 'young', 'adult', 'senior', 'unknown'] },
    distinctiveMarks: [String],

    injuries: [String],
    // 1 = healthy stray, 5 = life-threatening. Drives responder queue order.
    urgency: { type: Number, min: 1, max: 5 },

    generatedDescription: String,
    modelUsed: String,
    analyzedAt: Date,
    error: String,
  },
  { _id: false }
);

const statusEventSchema = new Schema(
  {
    status: { type: String, enum: REPORT_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, maxlength: 1000 },
    byOrganizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  },
  { _id: false }
);

const dogReportSchema = new Schema(
  {
    // 'found' = someone spotted a dog. 'lost' = an owner is looking for theirs.
    // One collection so matching is a query on a single index, not a join.
    kind: { type: String, enum: REPORT_KINDS, required: true, index: true },

    media: {
      type: [mediaSchema],
      validate: {
        validator: (v) => v.length > 0,
        message: 'At least one photo is required',
      },
    },

    location: { type: pointSchema, required: true },
    contact: { type: contactSchema, required: true },

    /**
     * Lets the person who filed a lost report manage it without an account.
     *
     * Reporting is deliberately anonymous, which left the owner of a missing dog
     * unable to do the one thing only they can know to do: say the dog is home.
     * Their report stayed open forever, kept surfacing in searches and kept
     * collecting sightings for a dog asleep on a sofa.
     *
     * A scoped token in an emailed link, not an account — see
     * docs/11-access-model.md and services/reportAccessService.js.
     * `select: false` so the hash never rides along in an API response.
     */
    manage: {
      tokenHash: { type: String, select: false },
      issuedAt: { type: Date },
      // Set when the owner closes the report or asks for a new link. A revoked
      // token stays in place rather than being deleted: "this link was retired"
      // and "this report never had one" are different answers.
      revokedAt: { type: Date, default: null },
    },

    description: { type: String, trim: true, maxlength: 3000 },
    condition: { type: String, enum: CONDITIONS, default: 'healthy', index: true },

    // Owner-supplied details on a 'lost' report; helps attribute matching.
    dogName: { type: String, trim: true, maxlength: 80 },
    breedGuess: { type: String, trim: true, maxlength: 120 },
    // When the dog was seen / went missing — not the same as createdAt.
    occurredAt: { type: Date, default: Date.now, index: true },

    aiAnalysis: { type: aiAnalysisSchema, default: null },
    analysisState: {
      type: String,
      enum: ['pending', 'processing', 'done', 'failed', 'skipped'],
      default: 'pending',
      index: true,
    },

    /**
     * 512-dim CLIP image embedding of the primary photo.
     * `select: false` — 512 floats per document would dominate every list
     * response for data the client never uses.
     */
    embedding: { type: [Number], select: false, default: undefined },

    /**
     * Stored rather than virtual because the responder queue sorts on it — a
     * virtual cannot be indexed, and sorting a city's worth of reports in memory
     * is not something to build in deliberately.
     * Maintained by the hooks below; never set it directly.
     */
    effectiveUrgency: { type: Number, min: 1, max: 5, default: 1, index: true },

    status: { type: String, enum: REPORT_STATUSES, default: 'open', index: true },
    assignedOrganizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    statusHistory: { type: [statusEventSchema], default: [] },

    // Set when an owner confirms a lost<->found match.
    matchedReportId: { type: Schema.Types.ObjectId, ref: 'DogReport', default: null },

    reporterUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  baseOptions
);

dogReportSchema.index({ location: '2dsphere' });
// Covers the main Find query: open found-dog reports, newest first.
dogReportSchema.index({ kind: 1, status: 1, occurredAt: -1 });
// Responder queue: worst cases first.
dogReportSchema.index({ status: 1, effectiveUrgency: -1, createdAt: -1 });

// Keep the stored urgency in step with its two inputs. insertMany bypasses
// document save middleware entirely, so the seed path needs its own hook.
// Mongoose 9 document middleware is promise-based — the `next` callback was
// removed, and declaring it throws "next is not a function".
dogReportSchema.pre('save', function () {
  this.effectiveUrgency = computeEffectiveUrgency({
    aiUrgency: this.aiAnalysis?.urgency,
    condition: this.condition,
  });
});

// Model middleware, however, has used both (next, docs) and (docs) across
// versions — pick the array out of the arguments rather than trusting position.
dogReportSchema.pre('insertMany', function (...args) {
  const docs = args.find(Array.isArray) ?? [];
  for (const d of docs) {
    d.effectiveUrgency = computeEffectiveUrgency({
      aiUrgency: d.aiAnalysis?.urgency,
      condition: d.condition,
    });
  }
  const next = args.find((a) => typeof a === 'function');
  if (next) next();
});

dogReportSchema.virtual('primaryMedia').get(function () {
  if (!this.media?.length) return null;
  return this.media.find((m) => m.isPrimary) ?? this.media.find((m) => m.resourceType === 'image') ?? this.media[0];
});

/** True when the model and the reporter disagree enough to be worth surfacing. */
dogReportSchema.virtual('urgencyDisagreement').get(function () {
  const ai = this.aiAnalysis?.urgency;
  if (!Number.isFinite(ai)) return null;
  const reporter = CONDITION_URGENCY[this.condition] ?? 1;
  if (Math.abs(ai - reporter) < 2) return null;
  return { ai, reporter, direction: ai > reporter ? 'ai_higher' : 'reporter_higher' };
});

dogReportSchema.methods.pushStatus = function (status, { note, byOrganizationId } = {}) {
  this.status = status;
  this.statusHistory.push({ status, note, byOrganizationId, at: new Date() });
  return this;
};

export const DogReport = mongoose.model('DogReport', dogReportSchema);
