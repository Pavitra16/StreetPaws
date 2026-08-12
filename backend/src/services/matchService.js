import { DogReport } from '../models/index.js';
import { cosineSimilarity, EMBEDDING_DIM } from './embeddingService.js';
import { fromPoint, haversineKm } from '../utils/geo.js';

export const VECTOR_INDEX_NAME = 'dogreport_embedding_index';

/**
 * Weights for the hybrid score. Deliberately in one exported object so the eval
 * harness can sweep them without touching the scoring logic.
 *
 * Visual similarity carries the most weight but cannot win alone: CLIP scores
 * two unrelated street dogs around 0.7, so a purely visual ranking is close to
 * noise on a population that mostly looks alike. The other three signals are
 * what separate "some tan dog" from "your tan dog".
 */
export const DEFAULT_WEIGHTS = {
  visual: 0.5,
  attributes: 0.25,
  geo: 0.15,
  time: 0.1,
};

/** Distance decay: 1.0 at the same spot, ~0.5 at 12km, ~0 beyond ~40km. */
function geoScore(distanceKm) {
  if (distanceKm == null) return 0;
  return Math.exp(-distanceKm / 17);
}

/**
 * A dog reported found BEFORE it was lost cannot be the same animal, so that
 * direction is scored zero rather than merely low. Afterwards, confidence decays
 * over about a month.
 */
function timeScore({ lostAt, foundAt }) {
  if (!lostAt || !foundAt) return 0.5; // unknown, stay neutral
  const days = (new Date(foundAt) - new Date(lostAt)) / 86400000;
  if (days < -1) return 0; // found more than a day before it went missing
  const d = Math.max(0, days);
  return Math.exp(-d / 30);
}

function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * Is there anything on both sides worth comparing?
 *
 * attributeScore returns a neutral 0.5 when it has nothing to work with, which
 * is right for that function in isolation — absence of evidence should not be
 * evidence of absence. But a constant applied to every candidate carries no
 * information while still consuming a quarter of the score, so the caller needs
 * to know the difference between "compared and scored 0.5" and "could not
 * compare at all".
 */
export function comparableAttributes(a, b) {
  const A = a ?? {};
  const B = b ?? {};
  const named = (v) => Boolean(norm(v)) && norm(v) !== 'unknown';

  return Boolean(
    (named(A.breed) && named(B.breed)) ||
      (A.colors?.length && B.colors?.length) ||
      (named(A.sizeEstimate) && named(B.sizeEstimate)) ||
      (A.distinctiveMarks?.length && B.distinctiveMarks?.length)
  );
}

/** Overlap of colours, breed, size and distinctive marks. */
export function attributeScore(a, b) {
  const A = a ?? {};
  const B = b ?? {};
  const parts = [];

  const breedA = norm(A.breed);
  const breedB = norm(B.breed);
  if (breedA && breedB && breedA !== 'unknown' && breedB !== 'unknown') {
    const exact = breedA === breedB;
    const partial = !exact && (breedA.includes(breedB) || breedB.includes(breedA));
    parts.push({ weight: 0.4, value: exact ? 1 : partial ? 0.6 : 0 });
  }

  const colorsA = (A.colors ?? []).map(norm).filter(Boolean);
  const colorsB = (B.colors ?? []).map(norm).filter(Boolean);
  if (colorsA.length && colorsB.length) {
    const setB = new Set(colorsB);
    const hits = colorsA.filter((c) => setB.has(c) || colorsB.some((x) => x.includes(c) || c.includes(x)));
    parts.push({ weight: 0.3, value: hits.length / Math.max(colorsA.length, colorsB.length) });
  }

  if (A.sizeEstimate && B.sizeEstimate && A.sizeEstimate !== 'unknown' && B.sizeEstimate !== 'unknown') {
    parts.push({ weight: 0.15, value: A.sizeEstimate === B.sizeEstimate ? 1 : 0 });
  }

  // Distinctive marks are the strongest human-readable signal — a torn left ear
  // is far more identifying than "tan" — so any token overlap counts fully.
  const marksA = (A.distinctiveMarks ?? []).map(norm).filter(Boolean);
  const marksB = (B.distinctiveMarks ?? []).map(norm).filter(Boolean);
  if (marksA.length && marksB.length) {
    const tokens = (list) => new Set(list.flatMap((m) => m.split(/\W+/).filter((w) => w.length > 3)));
    const tA = tokens(marksA);
    const tB = tokens(marksB);
    const shared = [...tA].filter((t) => tB.has(t));
    parts.push({ weight: 0.15, value: shared.length ? Math.min(1, shared.length / 2) : 0 });
  }

  if (!parts.length) return 0.5; // nothing comparable — stay neutral, don't punish
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  return parts.reduce((s, p) => s + p.weight * p.value, 0) / totalWeight;
}

/**
 * Retrieves candidates via Atlas Vector Search when the index exists, otherwise
 * scans and scores in memory.
 *
 * The fallback is not just belt-and-braces: the vector index has to be created
 * on the cluster, and a fresh clone of this repo will not have one. Falling back
 * keeps matching working while returning identical results at this data size.
 */
async function fetchCandidates({ embedding, excludeId, kind, limit }) {
  if (embedding?.length === EMBEDDING_DIM) {
    try {
      const docs = await DogReport.aggregate([
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: 'embedding',
            queryVector: embedding,
            numCandidates: Math.max(100, limit * 10),
            limit,
            filter: { kind: { $eq: kind } },
          },
        },
        { $addFields: { vectorScore: { $meta: 'vectorSearchScore' } } },
      ]);
      if (docs.length) {
        return { docs: docs.filter((d) => String(d._id) !== String(excludeId)), source: 'atlas_vector_search' };
      }
    } catch {
      // Index missing or still building — fall through to the scan.
    }
  }

  const docs = await DogReport.find({ kind, _id: { $ne: excludeId } })
    .select('+embedding')
    .limit(500)
    .lean();
  return { docs, source: 'in_memory_scan' };
}

/**
 * Ranks candidate reports against a query report.
 *
 * `query` is the thing being looked for (usually a 'lost' report); candidates
 * are of the opposite kind.
 */
export async function findMatches({
  queryEmbedding,
  queryAnalysis,
  queryLocation,
  queryDate,
  excludeId = null,
  kind = 'found',
  weights = DEFAULT_WEIGHTS,
  limit = 20,
}) {
  const { docs, source } = await fetchCandidates({
    embedding: queryEmbedding,
    excludeId,
    kind,
    limit: Math.max(limit * 3, 60),
  });

  const origin = queryLocation ? fromPoint(queryLocation) : null;

  const scored = docs.map((doc) => {
    const candidateCoords = fromPoint(doc.location);
    const distanceKm = origin && candidateCoords ? haversineKm(origin, candidateCoords) : null;

    const hasVisual = Boolean(queryEmbedding && doc.embedding?.length);
    const hasAttributes = comparableAttributes(queryAnalysis, doc.aiAnalysis);

    const visual = hasVisual
      ? Math.max(0, cosineSimilarity(queryEmbedding, doc.embedding))
      : 0;
    const attributes = hasAttributes ? attributeScore(queryAnalysis, doc.aiAnalysis) : 0;
    const geo = geoScore(distanceKm);
    const time = timeScore({ lostAt: queryDate, foundAt: doc.occurredAt });

    /**
     * Score over the signals we actually have, not all four.
     *
     * A missing signal used to contribute zero out of its full weight, which
     * quietly punished every candidate equally: with no stored embeddings the
     * best possible match capped at 35%, so an owner looking at their own dog
     * was told "35%" and reasonably concluded it was not them. The ranking was
     * unaffected — every row lost the same amount — but the number shown to a
     * person was wrong, and that number is the whole point of showing a score.
     *
     * Dividing by the weight actually in play means a score always reads as
     * "how well did this match on what we could compare", which is a claim the
     * system can honestly make.
     */
    const active = [
      hasVisual && [weights.visual, visual],
      hasAttributes && [weights.attributes, attributes],
      [weights.geo, geo],
      [weights.time, time],
    ].filter(Boolean);

    const totalWeight = active.reduce((s, [w]) => s + w, 0);
    const score = active.reduce((s, [w, v]) => s + w * v, 0) / totalWeight;

    return {
      doc,
      score,
      distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(2)),
      // Per-signal breakdown so the UI can explain WHY something surfaced.
      // An owner scanning twenty tan dogs needs the reason, not just a rank.
      breakdown: {
        // null, not 0 — "we could not compare this" is a different statement
        // from "we compared it and it scored nothing", and the UI must not
        // render the first as though it were the second.
        visual: hasVisual ? Number(visual.toFixed(3)) : null,
        attributes: hasAttributes ? Number(attributes.toFixed(3)) : null,
        geo: Number(geo.toFixed(3)),
        time: Number(time.toFixed(3)),
      },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return { matches: scored.slice(0, limit), source, candidatesConsidered: docs.length };
}
