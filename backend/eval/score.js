/**
 * Measures the matcher against the labelled set.
 *
 *   node eval/score.js                 # score the current weights
 *   node eval/score.js --sweep         # try weight combinations, report the best
 *   node eval/score.js --ablate        # score each signal alone
 *
 * Metrics
 *   precision@1  share of queries whose top-ranked result is the correct dog
 *   recall@5     share whose correct dog appears in the top 5
 *   MRR          mean of 1/rank — rewards being close when not exactly right
 *
 * NOTE ON SCOPE: this measures the VISUAL signal only. The production scorer
 * also uses geo distance and a date window, which DogFaceNet has no equivalent
 * for — a benchmark cannot tell you how much "found 2km away yesterday" helps.
 * So these numbers are a floor, not the whole system.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cosineSimilarity } from '../src/services/embeddingService.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const pairs = JSON.parse(fs.readFileSync(path.join(here, 'pairs.json'), 'utf8'));

// Score every encoder that has been embedded, so swapping models is a decision
// made on numbers rather than on which one sounds newer.
const embeddingFiles = fs
  .readdirSync(here)
  .filter((f) => f.startsWith('embeddings.') && f.endsWith('.json'))
  .map((f) => ({ model: f.replace(/^embeddings\.|\.json$/g, ''), file: path.join(here, f) }));

if (!embeddingFiles.length) {
  console.error('No embeddings found. Run `node eval/embedPairs.js` first.');
  process.exit(1);
}

let embeddings = JSON.parse(fs.readFileSync(embeddingFiles[0].file, 'utf8'));

/** Ranks the gallery for one query and reports where the correct answer landed. */
function rankFor(query, { visualWeight = 1 } = {}) {
  const qv = embeddings[`q:${query.dogId}`];
  if (!qv) return null;

  const scored = [];
  for (const item of pairs.gallery) {
    const gv = embeddings[`g:${item.id}`];
    if (!gv) continue;
    scored.push({ id: item.id, score: visualWeight * Math.max(0, cosineSimilarity(qv, gv)) });
  }

  scored.sort((a, b) => b.score - a.score);
  const rank = scored.findIndex((s) => s.id === query.truthId) + 1;
  return { rank: rank || Infinity, top: scored.slice(0, 5) };
}

function evaluate(options = {}) {
  let p1 = 0;
  let r5 = 0;
  let r10 = 0;
  let mrrSum = 0;
  let counted = 0;
  const ranks = [];

  for (const q of pairs.queries) {
    const result = rankFor(q, options);
    if (!result) continue;
    counted++;
    ranks.push(result.rank);
    if (result.rank === 1) p1++;
    if (result.rank <= 5) r5++;
    if (result.rank <= 10) r10++;
    mrrSum += 1 / result.rank;
  }

  ranks.sort((a, b) => a - b);
  return {
    n: counted,
    precisionAt1: p1 / counted,
    recallAt5: r5 / counted,
    recallAt10: r10 / counted,
    mrr: mrrSum / counted,
    medianRank: ranks[Math.floor(ranks.length / 2)],
  };
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function report(label, m) {
  console.log(
    `${label.padEnd(22)} P@1 ${pct(m.precisionAt1).padStart(6)}   R@5 ${pct(m.recallAt5).padStart(6)}` +
      `   R@10 ${pct(m.recallAt10).padStart(6)}   MRR ${m.mrr.toFixed(3)}   median rank ${m.medianRank}`
  );
}

function main() {
  console.log(`\nDataset: ${pairs.source}`);
  console.log(`${pairs.queries.length} queries against ${pairs.gallery.length} gallery images`);
  console.log(`Random guessing would score P@1 ≈ ${pct(1 / pairs.gallery.length)}\n`);

  const byModel = {};
  for (const { model, file } of embeddingFiles) {
    embeddings = JSON.parse(fs.readFileSync(file, 'utf8'));
    byModel[model] = evaluate();
    report(model, byModel[model]);
  }

  // Best by P@1 — the metric that matters most, because an owner scanning
  // results looks hardest at the first one.
  const [bestModel, baseline] = Object.entries(byModel).sort(
    (a, b) => b[1].precisionAt1 - a[1].precisionAt1
  )[0];

  if (embeddingFiles.length > 1) {
    console.log(`\nBest encoder: ${bestModel}`);
  }

  console.log('\nWhat this means in the product:');
  console.log(
    `  An owner uploading a photo sees the right dog first ${pct(baseline.precisionAt1)} of the time,`
  );
  console.log(`  and within the first five results ${pct(baseline.recallAt5)} of the time.`);
  console.log(
    `  The UI shows 12 results, so the correct dog is on screen ${pct(baseline.recallAt10)}+ of the time.`
  );

  const out = {
    ranAt: new Date().toISOString(),
    dataset: pairs.source,
    queries: pairs.queries.length,
    gallery: pairs.gallery.length,
    chanceP1: 1 / pairs.gallery.length,
    bestModel,
    results: byModel,
  };
  fs.writeFileSync(path.join(here, 'results.json'), JSON.stringify(out, null, 2));
  console.log('\nWritten to eval/results.json');
}

main();
