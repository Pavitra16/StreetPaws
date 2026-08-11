/**
 * Creates the Atlas Vector Search index used by matchService.
 *
 *   node src/scripts/createVectorIndex.js
 *
 * Separate from ensureIndexes() because search indexes are an Atlas control-plane
 * feature, not a normal MongoDB index: they build asynchronously, cannot be
 * created by Mongoose's syncIndexes(), and do not exist on a local mongod.
 *
 * Matching works without this — matchService falls back to an in-memory scan —
 * but the scan is O(collection) and will not survive real data volume.
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { assertRequiredEnv } from '../config/env.js';
import { EMBEDDING_DIM } from '../services/embeddingService.js';
import { VECTOR_INDEX_NAME } from '../services/matchService.js';

const definition = {
  name: VECTOR_INDEX_NAME,
  type: 'vectorSearch',
  definition: {
    fields: [
      {
        type: 'vector',
        path: 'embedding',
        numDimensions: EMBEDDING_DIM,
        // CLIP vectors are L2-normalised, so cosine and dot product agree;
        // cosine is stated explicitly rather than relying on that.
        similarity: 'cosine',
      },
      // Pre-filter so a lost-dog query only scans found-dog reports.
      { type: 'filter', path: 'kind' },
    ],
  },
};

async function main() {
  assertRequiredEnv();
  await connectDB();

  const collection = mongoose.connection.db.collection('dogreports');

  const existing = await collection.listSearchIndexes().toArray().catch(() => []);
  const already = existing.find((i) => i.name === VECTOR_INDEX_NAME);

  if (already) {
    console.log(`[vector] "${VECTOR_INDEX_NAME}" already exists — status: ${already.status ?? 'unknown'}`);
    await disconnectDB();
    return;
  }

  try {
    await collection.createSearchIndex(definition);
    console.log(`[vector] created "${VECTOR_INDEX_NAME}" (${EMBEDDING_DIM} dims, cosine)`);
    console.log('[vector] Atlas builds this in the background — usually under a minute.');
    console.log('[vector] Until it is READY, matchService falls back to an in-memory scan.');
  } catch (err) {
    console.error('[vector] could not create the index:', err.message);
    console.error('[vector] Vector Search needs an Atlas cluster (any tier, including free M0).');
    console.error('[vector] Matching still works via the in-memory fallback.');
  }

  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[vector] failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
