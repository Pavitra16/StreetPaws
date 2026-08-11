import { pipeline, env as hfEnv } from '@huggingface/transformers';
import { buildUrl, ANALYSIS } from '../config/cloudinary.js';

/**
 * CLIP image embeddings, computed locally.
 *
 * Local rather than an API because Gemini's embedding model is text-only, and
 * Google's image embeddings live on Vertex AI behind a billing account. CLIP in
 * Node costs nothing per call and keeps the whole matching feature free to run.
 *
 * Trade-off: the model weights (~90 MB) download once on first use and the
 * first embedding therefore takes several seconds. Every one after is fast.
 */

/**
 * patch16 over patch32 on measured accuracy, not vibes — see eval/README.md.
 * On 120 queries against a 500-image gallery it scored P@1 49.2% vs 48.3% and
 * R@10 73.3% vs 69.2%, at ~2.6x the compute. Embedding runs once per report on
 * a background job, so that compute is not on any user's critical path.
 *
 * Changing this invalidates every stored embedding — re-run `npm run embed-backfill`
 * and rebuild the Atlas vector index if the dimension changes.
 */
const MODEL_ID = 'Xenova/clip-vit-base-patch16';
export const EMBEDDING_DIM = 512;

hfEnv.allowLocalModels = false; // always resolve from the Hub cache

let extractorPromise = null;

/** Lazily loads the model. Concurrent callers share one download. */
function getExtractor() {
  extractorPromise ??= pipeline('image-feature-extraction', MODEL_ID).catch((err) => {
    // Reset so a transient network failure does not poison every later call.
    extractorPromise = null;
    throw err;
  });
  return extractorPromise;
}

export async function warmUpEmbedder() {
  await getExtractor();
}

/**
 * Embeds an image by Cloudinary public ID.
 * Returns a unit-length Float array of EMBEDDING_DIM.
 */
export async function embedImageByPublicId(publicId) {
  const url = buildUrl(publicId, ANALYSIS);
  return embedImageByUrl(url);
}

export async function embedImageByUrl(url) {
  const extractor = await getExtractor();
  const output = await extractor(url, { pooling: 'mean', normalize: true });
  const vector = Array.from(output.data);

  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding size ${vector.length}, expected ${EMBEDDING_DIM}`);
  }
  return vector;
}

/**
 * Cosine similarity. The vectors are already L2-normalised by the extractor, so
 * this is a dot product — but normalise defensively rather than assume, because
 * a silently unnormalised vector produces plausible-looking wrong scores.
 */
export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
