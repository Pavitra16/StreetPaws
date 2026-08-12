import { fromPoint, haversineKm } from './geo.js';
import { computeEffectiveUrgency, CONDITION_URGENCY } from '../models/DogReport.js';

/**
 * Reporter phone numbers on a public page get scraped within days, and the
 * people reporting street dogs did not sign up for that. Contact details are
 * masked for everyone except a verified responder, who gets them because they
 * need to call about the animal.
 */
export function maskContact(contact) {
  if (!contact) return null;
  const { name, phone, email, preferredChannel } = contact;
  return {
    name: name ? `${name.split(' ')[0]} ${name.split(' ')[1]?.[0] ?? ''}`.trim() : null,
    phone: phone ? `${phone.slice(0, 3)}••••••${phone.slice(-2)}` : null,
    email: email ? `${email[0]}••••@${email.split('@')[1] ?? ''}` : null,
    preferredChannel,
    masked: true,
  };
}

export function serializeReport(report, { revealContact = false, origin = null } = {}) {
  const json = typeof report.toJSON === 'function' ? report.toJSON() : { ...report };

  json.contact = revealContact ? { ...json.contact, masked: false } : maskContact(json.contact);

  // Embedding is select:false, but a lean() query with an explicit projection
  // could still pull it through. Never ship 512 floats to a browser.
  delete json.embedding;

  const coords = fromPoint(report.location);
  if (coords) {
    json.lat = coords.lat;
    json.lng = coords.lng;
    if (origin) json.distanceKm = Number(haversineKm(origin, coords).toFixed(2));
  }

  // Virtuals do not survive lean(); recompute what the UI depends on.
  if (json.effectiveUrgency == null) {
    json.effectiveUrgency = computeEffectiveUrgency({
      aiUrgency: json.aiAnalysis?.urgency,
      condition: json.condition,
    });
  }
  if (json.urgencyDisagreement === undefined) {
    const ai = json.aiAnalysis?.urgency;
    const reporter = CONDITION_URGENCY[json.condition] ?? 1;
    json.urgencyDisagreement =
      Number.isFinite(ai) && Math.abs(ai - reporter) >= 2
        ? { ai, reporter, direction: ai > reporter ? 'ai_higher' : 'reporter_higher' }
        : null;
  }
  /**
   * Whether anyone actually stated a breed.
   *
   * A breed search deliberately also returns reports with no breed recorded
   * (see searchController), so the UI needs to be able to say why a dog that
   * is plainly not a Beagle turned up in a Beagle search. Without that label
   * the widened search reads as a bug.
   */
  json.breedConfirmed = Boolean(json.breedGuess?.trim() || json.aiAnalysis?.breed?.trim());

  if (json.primaryMedia === undefined) {
    json.primaryMedia =
      json.media?.find((m) => m.isPrimary) ??
      json.media?.find((m) => m.resourceType === 'image') ??
      json.media?.[0] ??
      null;
  }

  return json;
}

export function serializeOrganization(org, { origin = null } = {}) {
  const json = typeof org.toJSON === 'function' ? org.toJSON() : { ...org };
  const coords = fromPoint(org.location);
  if (coords) {
    json.lat = coords.lat;
    json.lng = coords.lng;
    if (origin) json.distanceKm = Number(haversineKm(origin, coords).toFixed(2));
  }
  return json;
}
