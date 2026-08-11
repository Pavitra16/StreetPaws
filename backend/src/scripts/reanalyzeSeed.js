/**
 * Replaces hand-written seed analysis with a real AI pass over the actual photo.
 *
 *   npm run seed:reanalyze
 *
 * The seed script pairs a random placeholder image with a hand-written breed, so
 * a card could read "Golden Retriever" above a photo of a border collie. Running
 * the real pipeline over the images that are actually there makes the two agree —
 * and demo data that contradicts itself undermines the whole feature.
 *
 * The reporter's own description is left untouched. That is deliberate: a
 * reporter describes the situation ("sitting outside the temple for three days")
 * while the model describes the animal. They are different things and both
 * belong on the page.
 */
import { connectDB, disconnectDB } from '../config/db.js';
import { assertRequiredEnv } from '../config/env.js';
import { DogReport } from '../models/index.js';
import { analyzeDogPhoto, isAiConfigured } from '../services/aiService.js';
import { embedImageByUrl } from '../services/embeddingService.js';
import { computeEffectiveUrgency } from '../models/DogReport.js';

async function main() {
  assertRequiredEnv();
  await connectDB();

  if (!isAiConfigured()) {
    console.error('GEMINI_API_KEY is not set — nothing to re-analyse with.');
    process.exit(1);
  }

  const reports = await DogReport.find({ 'aiAnalysis.modelUsed': 'seed' }).select('+embedding');
  console.log(`[reanalyze] ${reports.length} seeded reports to re-analyse`);

  let done = 0;
  let failed = 0;
  let quotaExhausted = false;

  // The free tier allows 5 requests/minute, so pace at ~13s between calls.
  // Without this the script fires all 20 at once and most of them 429.
  const PACE_MS = 13000;

  for (const report of reports) {
    if (quotaExhausted) {
      failed++;
      continue;
    }
    if (done > 0) await new Promise((r) => setTimeout(r, PACE_MS));
    const primary =
      report.media.find((m) => m.isPrimary && m.resourceType === 'image') ??
      report.media.find((m) => m.resourceType === 'image');
    if (!primary) {
      failed++;
      continue;
    }

    try {
      // Seeded media points at external placeholder URLs rather than Cloudinary
      // public IDs, so analyse by URL.
      const [analysis, embedding] = await Promise.all([
        analyzeDogPhoto({ imageUrl: primary.url }),
        embedImageByUrl(primary.url).catch(() => null),
      ]);

      const before = report.aiAnalysis?.breed;
      // Keep the reporter's own words about urgency — the max() rule still
      // applies, so a critical report stays critical even if the stock photo
      // shows a healthy dog.
      report.aiAnalysis = analysis;
      if (embedding) report.embedding = embedding;
      report.analysisState = 'done';
      await report.save();

      done++;
      console.log(
        `  ${String(done).padStart(2)}/${reports.length}  ${before} → ${analysis.breed}` +
          `  (urgency ${analysis.urgency}, effective ${report.effectiveUrgency})`
      );
    } catch (err) {
      failed++;
      const msg = String(err.message ?? '');
      // A per-DAY quota failure will not clear by waiting a few seconds, so stop
      // rather than grinding through the rest producing identical errors.
      if (/PerDay|GenerateRequestsPerDay/.test(msg)) {
        quotaExhausted = true;
        console.warn('\n  Daily Gemini free-tier quota exhausted — stopping.');
        console.warn('  Remaining reports keep their existing analysis. Re-run tomorrow.');
      } else if (/429|RESOURCE_EXHAUSTED/.test(msg)) {
        console.warn(`  rate limited on ${report.id} — pacing may need to be slower`);
      } else {
        console.warn(`  failed on ${report.id}: ${msg.slice(0, 120)}`);
      }
    }
  }

  console.log(`\n[reanalyze] ${done} updated, ${failed} failed`);
  console.log('[reanalyze] breeds and descriptions now come from the photos actually shown.');
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[reanalyze] failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
