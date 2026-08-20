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

/**
 * Whether the reporter published their own number.
 *
 * The masking rule above was written for 'found' reports, where the reporter is
 * a bystander who did a good deed and did not sign up for phone calls. A 'lost'
 * report is the opposite situation: the reporter is the owner, and the entire
 * purpose of the page is that whoever spots the dog can reach them. Masking it
 * there is a missing-pet poster with the number blacked out.
 *
 * Consent is explicit (contact.showPublicly) rather than implied by kind, because
 * some owners would rather be reached another way — and because publishing a
 * phone number should be a thing someone chose, not a thing we inferred.
 */
function ownerPublishedContact(report) {
  return report.kind === 'lost' && Boolean(report.contact?.showPublicly);
}

/**
 * `allowOwnerConsent` is opt-in per call site and defaults to false so that
 * consent applies on a single dog's page and never to a list. Revealing one
 * owner's number to someone reading about their dog is the point; returning
 * fifty of them from a paginated search is a scraper with a UI.
 */
export function serializeReport(
  report,
  { revealContact = false, allowOwnerConsent = false, origin = null } = {}
) {
  const json = typeof report.toJSON === 'function' ? report.toJSON() : { ...report };

  /**
   * lean() skips the toJSON transform that renames _id to id, and the match
   * endpoint queries lean. Every match result therefore shipped Mongo's _id and
   * no id at all, so the UI built links to /reports/undefined — the one click
   * the whole matching feature exists to offer.
   */
  if (json.id == null && json._id != null) json.id = String(json._id);
  delete json._id;
  delete json.__v;

  const publishedByOwner = allowOwnerConsent && ownerPublishedContact(report);
  if (revealContact || publishedByOwner) {
    // showPublicly is the stored consent record; publishedByOwner is what the
    // page acts on. Shipping both just invites them to drift apart.
    const { showPublicly, ...contact } = json.contact ?? {};
    json.contact = { ...contact, masked: false, publishedByOwner };
  } else {
    json.contact = maskContact(json.contact);
  }

  // Embedding is select:false, but a lean() query with an explicit projection
  // could still pull it through. Never ship 512 floats to a browser.
  delete json.embedding;

  /**
   * Same reasoning, sharper stakes. `manage.tokenHash` is select:false, but that
   * only governs what a *query* returns — a document just built by create() has
   * every field set in memory, so the create response carried the stored hash
   * straight back out. Credential material never belongs in a payload, whoever
   * is reading it.
   */
  delete json.manage;

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
