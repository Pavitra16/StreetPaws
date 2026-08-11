import { Organization } from '../models/index.js';
import { fromPoint, haversineKm, withinRadius } from '../utils/geo.js';

/**
 * Picks which organisations hear about a report, and in what order.
 *
 * Deliberately a transparent rule rather than a learned model. With a handful of
 * organisations and no outcome history, a learned ranker would be fitting noise —
 * and when a rescuer asks "why wasn't I told about the dog on my street", a
 * weighted sum you can print beats a model you cannot explain.
 *
 * Alert.routingScore stores each score at send time, so once there is real
 * response history the weights can be tuned against it (and only then).
 */

export const ROUTING_WEIGHTS = {
  proximity: 0.45,
  capacity: 0.2,
  specialization: 0.2,
  reliability: 0.15,
};

/**
 * Urgency shifts weight toward proximity.
 *
 * Found in testing: a rescuer 1.5km away ranked below one 9km away purely
 * because the nearer one was at half capacity. For a dog bleeding on a road,
 * minutes beat tidy caseloads — so as urgency rises, distance dominates and
 * capacity/reliability matter less. At urgency 1 the balanced weights apply.
 */
export function weightsForUrgency(urgency) {
  if (urgency <= 3) return ROUTING_WEIGHTS;

  const shift = urgency === 5 ? 0.2 : 0.1;
  return {
    proximity: ROUTING_WEIGHTS.proximity + shift,
    capacity: Math.max(0.05, ROUTING_WEIGHTS.capacity - shift / 2),
    specialization: ROUTING_WEIGHTS.specialization,
    reliability: Math.max(0.05, ROUTING_WEIGHTS.reliability - shift / 2),
  };
}

/** Urgency 5 reaches further — a critical case is worth waking someone across town. */
export function reachKmForUrgency(urgency) {
  return { 5: 25, 4: 18, 3: 12, 2: 8, 1: 6 }[urgency] ?? 10;
}

/** Which specialisations a report calls for, from its condition and AI read. */
export function neededSpecializations(report) {
  const needs = new Set();
  const condition = report.condition;
  const ai = report.aiAnalysis ?? {};
  const injuries = (ai.injuries ?? []).join(' ').toLowerCase();
  const text = `${report.description ?? ''} ${ai.generatedDescription ?? ''}`.toLowerCase();

  if (condition === 'critical' || condition === 'injured') needs.add('injury');
  if (/wound|bleed|fracture|broken|hit by|accident|amputat/.test(injuries + text)) {
    needs.add('injury');
    needs.add('surgery');
  }
  if (/mange|skin|fur loss|scabies|patchy|bald/.test(injuries + text)) needs.add('skin_disease');
  if (ai.ageEstimate === 'puppy' || /puppy|puppies|litter/.test(text)) needs.add('puppies');
  if (/rabies|bite|aggressive|foaming/.test(injuries + text)) needs.add('rabies');

  return [...needs];
}

function proximityScore(distanceKm, serviceRadiusKm) {
  if (distanceKm == null) return 0;
  // Full marks inside their own stated radius, tapering off beyond it rather
  // than dropping to zero — a willing rescuer 1km outside their radius still beats nobody.
  if (distanceKm <= serviceRadiusKm) return 1 - (distanceKm / serviceRadiusKm) * 0.3;
  const over = distanceKm - serviceRadiusKm;
  return Math.max(0, 0.7 * Math.exp(-over / 8));
}

function capacityScore(org) {
  if (!org.capacity) return 0;
  const free = (org.capacity - (org.activeCaseCount ?? 0)) / org.capacity;
  return Math.max(0, Math.min(1, free));
}

function specializationScore(org, needs) {
  if (!needs.length) return 0.5; // nothing specific required — nobody advantaged
  const have = new Set(org.specializations ?? []);
  const hits = needs.filter((n) => have.has(n)).length;
  return hits / needs.length;
}

function reliabilityScore(org) {
  const { assigned = 0, accepted = 0 } = org.responseStats ?? {};
  // Below a handful of data points an acceptance rate is meaningless; start
  // everyone at neutral so a new organisation is not buried before it can prove itself.
  if (assigned < 5) return 0.5;
  return Math.max(0, Math.min(1, accepted / assigned));
}

/**
 * Ranks organisations for a report. Returns scored candidates, best first.
 */
export async function rankOrganizationsForReport(report, { limit = 5, overrideReachKm = null } = {}) {
  const urgency = report.effectiveUrgency ?? 1;
  const reachKm = overrideReachKm ?? reachKmForUrgency(urgency);
  const origin = fromPoint(report.location);
  if (!origin) return [];

  // Only approved organisations are routed to. A pending or rejected applicant
  // must never receive a report — it contains a member of the public's location
  // and, for verified orgs, their phone number.
  const orgs = await Organization.find({
    ...Organization.operationalFilter(),
    location: withinRadius(origin.lat, origin.lng, reachKm),
  });

  const needs = neededSpecializations(report);
  const weights = weightsForUrgency(urgency);

  const scored = orgs
    .map((org) => {
      const coords = fromPoint(org.location);
      const distanceKm = coords ? haversineKm(origin, coords) : null;

      const parts = {
        proximity: proximityScore(distanceKm, org.serviceRadiusKm ?? 10),
        capacity: capacityScore(org),
        specialization: specializationScore(org, needs),
        reliability: reliabilityScore(org),
      };

      const score =
        weights.proximity * parts.proximity +
        weights.capacity * parts.capacity +
        weights.specialization * parts.specialization +
        weights.reliability * parts.reliability;

      return { org, score, distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(2)), parts };
    })
    // A full organisation is skipped unless the case is critical, where somebody
    // being told matters more than their queue being tidy.
    .filter((c) => urgency >= 5 || c.parts.capacity > 0);

  scored.sort((a, b) => b.score - a.score);
  return { candidates: scored.slice(0, limit), needs, reachKm, weights, considered: orgs.length };
}
