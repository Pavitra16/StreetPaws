/**
 * Embeds every image in eval/pairs.json with the same CLIP model the app uses.
 *
 *   node eval/embedPairs.js
 *
 * Split out from scoring because embedding 500 images takes minutes, while a
 * weight sweep takes seconds — caching the vectors means you can re-tune the
 * scorer dozens of times without recomputing anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env as hfEnv, RawImage } from '@huggingface/transformers';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAIRS = path.join(here, 'pairs.json');

hfEnv.allowLocalModels = false;

// Which encoder to test. Defaults to the one production uses; pass --model to
// compare alternatives before committing to a swap.
const MODEL = process.argv.includes('--model')
  ? process.argv[process.argv.indexOf('--model') + 1]
  : 'Xenova/clip-vit-base-patch32';
const OUT = path.join(here, `embeddings.${MODEL.split('/').pop()}.json`);

async function main() {
  if (!fs.existsSync(PAIRS)) {
    console.error('Run `node eval/buildPairs.js` first.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(PAIRS, 'utf8'));
  const items = [
    ...data.queries.map((q) => ({ key: `q:${q.dogId}`, imagePath: q.imagePath })),
    ...data.gallery.map((g) => ({ key: `g:${g.id}`, imagePath: g.imagePath })),
  ];

  console.log(`[embed] loading ${MODEL}…`);
  const extractor = await pipeline('image-feature-extraction', MODEL);

  const embeddings = {};
  const started = Date.now();

  for (let i = 0; i < items.length; i++) {
    const { key, imagePath } = items[i];
    try {
      // Read from disk rather than a URL — same model and settings as
      // embeddingService.js, so the numbers transfer to production.
      const image = await RawImage.read(imagePath);
      const out = await extractor(image, { pooling: 'mean', normalize: true });
      embeddings[key] = Array.from(out.data);
    } catch (err) {
      console.warn(`\n[embed] failed on ${imagePath}: ${err.message}`);
    }

    if ((i + 1) % 25 === 0 || i === items.length - 1) {
      const rate = (i + 1) / ((Date.now() - started) / 1000);
      process.stdout.write(`\r[embed] ${i + 1}/${items.length} (${rate.toFixed(1)}/s)`);
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(embeddings));
  console.log(`\n[embed] ${Object.keys(embeddings).length} vectors -> ${path.basename(OUT)}`);
}

main().catch((err) => {
  console.error('[embed] failed:', err);
  process.exit(1);
});
