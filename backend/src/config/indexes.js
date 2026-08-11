import mongoose from 'mongoose';
import * as models from '../models/index.js';

/**
 * Builds every declared index and waits for completion.
 *
 * Mongoose's `autoIndex` is lazy — it fires on first model use and is not
 * awaited, so a short-lived script (or a cold server taking its first request)
 * can issue a $near query before the 2dsphere index exists and get
 * "unable to find index for $geoNear query". Calling this explicitly at startup
 * and in the seed removes that race.
 *
 * syncIndexes() also drops indexes that are no longer declared in the schema,
 * which keeps the database honest as the models change during development.
 */
export async function ensureIndexes({ verbose = false } = {}) {
  const modelList = Object.values(models).filter(
    (m) => m?.prototype instanceof mongoose.Document || m?.syncIndexes
  );

  const results = await Promise.all(
    modelList.map(async (Model) => {
      const dropped = await Model.syncIndexes();
      return { name: Model.modelName, dropped };
    })
  );

  if (verbose) {
    for (const { name, dropped } of results) {
      const detail = dropped?.length ? ` (dropped stale: ${dropped.join(', ')})` : '';
      console.log(`[db] indexes ready: ${name}${detail}`);
    }
  }
  return results;
}
