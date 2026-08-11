import { DogReport } from '../models/index.js';
import { analyzeDogPhoto, isAiConfigured } from '../services/aiService.js';
import { embedImageByPublicId } from '../services/embeddingService.js';
import { fanOutReport } from '../services/notifyService.js';

/**
 * A deliberately small in-process queue.
 *
 * The plan calls for BullMQ/Redis only if throughput demands it. Because the work
 * is isolated behind queueAnalysis(), swapping the implementation later touches
 * this file and nothing else. What this does give us: bounded concurrency (so a
 * burst of reports cannot open fifty simultaneous model calls) and retry with
 * backoff (so free-tier rate limits delay an analysis rather than losing it).
 */
const MAX_CONCURRENT = 2;
const MAX_ATTEMPTS = 3;

const queue = [];
let running = 0;

export function queueAnalysis(reportId, { attempt = 1 } = {}) {
  queue.push({ reportId, attempt });
  drain();
}

function drain() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    running += 1;
    runJob(job)
      .catch((err) => console.error('[analyze] unexpected job failure:', err))
      .finally(() => {
        running -= 1;
        drain();
      });
  }
}

async function runJob({ reportId, attempt }) {
  const report = await DogReport.findById(reportId);
  if (!report) return;

  if (!isAiConfigured()) {
    report.analysisState = 'skipped';
    await report.save();
    // Still route it — the reporter's own condition is enough to act on.
    await fanOutReport(report).catch((e) => console.error('[analyze] fan-out failed:', e.message));
    return;
  }

  const primary =
    report.media.find((m) => m.isPrimary && m.resourceType === 'image') ??
    report.media.find((m) => m.resourceType === 'image');

  if (!primary) {
    // Video-only report: nothing for the vision pass to read, but a rescuer can
    // watch the video perfectly well.
    report.analysisState = 'skipped';
    await report.save();
    await fanOutReport(report).catch((e) => console.error('[analyze] fan-out failed:', e.message));
    return;
  }

  report.analysisState = 'processing';
  await report.save();

  try {
    // Run both passes together — they are independent and the embedding is
    // local, so the wall-clock cost is whichever is slower, not the sum.
    const [analysis, embedding] = await Promise.all([
      analyzeDogPhoto({
        publicId: primary.cloudinaryPublicId,
        resourceType: primary.resourceType,
      }),
      embedImageByPublicId(primary.cloudinaryPublicId).catch((err) => {
        // A missing embedding degrades matching to attributes + geo + time.
        // It must not fail the whole analysis, which is what the queue needs.
        console.warn(`[analyze] ${reportId} embedding failed: ${err.message}`);
        return null;
      }),
    ]);

    report.aiAnalysis = analysis;
    if (embedding) report.embedding = embedding;
    report.analysisState = 'done';
    await report.save();

    console.log(
      `[analyze] ${reportId} → ${analysis.breed}, urgency ${analysis.urgency}` +
        `${embedding ? ', embedded' : ', no embedding'}`
    );

    // Routing reads effectiveUrgency, so it has to run after the analysis lands.
    // A report with no dog in the photo is not sent to anyone — there is nothing
    // for a rescuer to act on, and a false alarm costs them a trip.
    if (analysis.isDog !== false) {
      await fanOutReport(report).catch((err) =>
        console.error(`[analyze] ${reportId} fan-out failed:`, err.message)
      );
    } else {
      console.log(`[analyze] ${reportId}: no dog in photo, not routed`);
    }
  } catch (err) {
    const retryable = isRetryable(err);

    if (retryable && attempt < MAX_ATTEMPTS) {
      const delayMs = 2000 * 2 ** (attempt - 1); // 2s, 4s
      console.warn(`[analyze] ${reportId} attempt ${attempt} failed (${err.message}); retrying in ${delayMs}ms`);
      report.analysisState = 'pending';
      await report.save();
      setTimeout(() => queueAnalysis(reportId, { attempt: attempt + 1 }), delayMs).unref();
      return;
    }

    console.error(`[analyze] ${reportId} failed permanently:`, err.message);
    report.analysisState = 'failed';
    report.aiAnalysis = { error: err.message?.slice(0, 500), analyzedAt: new Date() };
    await report.save();

    // The AI is an accelerator, not a gate. If it fails we still route on the
    // reporter's own condition — an injured dog must not go unreported because
    // a vision model was rate-limited.
    await fanOutReport(report).catch((e) =>
      console.error(`[analyze] ${reportId} fallback fan-out failed:`, e.message)
    );
  }
}

function isRetryable(err) {
  const msg = String(err?.message ?? '');
  // Rate limits and transient upstream failures are worth another go; a 400 on
  // our own request shape is not.
  return /\b(429|500|502|503|504)\b|rate limit|quota|overloaded|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg);
}

/**
 * Re-queues work that was in flight when the process last stopped.
 *
 * The queue lives in memory, so a restart mid-analysis leaves a report stuck on
 * `processing` forever: the detail page polls for an update that never comes,
 * and — worse — the report is never fanned out, so no rescuer is ever told about
 * the dog. Silent, and exactly the failure this product cannot have.
 *
 * `pending` is included because a report can be created and the process die
 * before its job is ever picked up.
 */
export async function recoverOrphanedJobs() {
  const orphans = await DogReport.find({
    analysisState: { $in: ['processing', 'pending'] },
  })
    .select('_id analysisState')
    .lean();

  if (!orphans.length) return { recovered: 0 };

  for (const o of orphans) queueAnalysis(String(o._id));

  console.log(`[analyze] re-queued ${orphans.length} report(s) left unfinished by a restart`);
  return { recovered: orphans.length };
}

/** Test/ops helper: resolves once the queue is empty. */
export async function waitForIdle({ timeoutMs = 60000 } = {}) {
  const start = Date.now();
  while ((queue.length > 0 || running > 0) && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 200));
  }
  return queue.length === 0 && running === 0;
}
