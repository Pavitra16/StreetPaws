/**
 * Computes CLIP embeddings for reports that don't have one.
 *
 *   npm run embed-backfill
 *
 * Needed for seeded data (which never went through the analysis job) and after
 * any change to the embedding model.
 */
import { connectDB, disconnectDB } from '../config/db.js';
import { assertRequiredEnv } from '../config/env.js';
import { DogReport } from '../models/index.js';
import { embedImageByUrl, warmUpEmbedder } from '../services/embeddingService.js';

async function main() {
  assertRequiredEnv();
  await connectDB();

  console.log('[embed] loading CLIP model…');
  await warmUpEmbedder();

  /**
   * --force re-embeds everything, which is REQUIRED after changing MODEL_ID in
   * embeddingService.js. Vectors from two different encoders are not comparable:
   * cosine similarity between them returns a plausible-looking number that means
   * nothing, so matching degrades silently rather than failing loudly.
   */
  const force = process.argv.includes('--force');

  const reports = await DogReport.find({
    ...(force ? {} : { embedding: { $exists: false } }),
    'media.0': { $exists: true },
  }).select('+embedding');

  console.log(
    `[embed] ${reports.length} reports to embed${force ? ' (--force: re-embedding all)' : ''}`
  );
  if (!force && reports.length === 0) {
    console.log('[embed] nothing to do. If you changed the embedding model, re-run with --force.');
  }

  let done = 0;
  let failed = 0;

  for (const report of reports) {
    const primary =
      report.media.find((m) => m.isPrimary && m.resourceType === 'image') ??
      report.media.find((m) => m.resourceType === 'image');

    if (!primary) {
      failed++;
      continue;
    }

    try {
      // Seeded reports point at external placeholder URLs rather than Cloudinary
      // public IDs, so embed by URL and let real reports use the same path.
      report.embedding = await embedImageByUrl(primary.url);
      await report.save();
      done++;
      process.stdout.write(`\r[embed] ${done}/${reports.length}`);
    } catch (err) {
      failed++;
      console.warn(`\n[embed] ${report.id} failed: ${err.message}`);
    }
  }

  console.log(`\n[embed] done: ${done} embedded, ${failed} failed`);
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[embed] failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
