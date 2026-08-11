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

    const visual =
      queryEmbedding && doc.embedding?.length
        ? Math.max(0, cosineSimilarity(queryEmbedding, doc.embedding))
        : 0;
    const attributes = attributeScore(queryAnalysis, doc.aiAnalysis);
    const geo = geoScore(distanceKm);
    const time = timeScore({ lostAt: queryDate, foundAt: doc.occurredAt });

    const score =
      weights.visual * visual +
      weights.attributes * attributes +
      weights.geo * geo +
      weights.time * time;

    return {
      doc,
      score,
      distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(2)),
      // Per-signal breakdown so the UI can explain WHY something surfaced.
      // An owner scanning twenty tan dogs needs the reason, not just a rank.
      breakdown: {
        visual: Number(visual.toFixed(3)),
        attributes: Number(attributes.toFixed(3)),
        geo: Number(geo.toFixed(3)),
        time: Number(time.toFixed(3)),
      },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return { matches: scored.slice(0, limit), source, candidatesConsidered: docs.length };
}
