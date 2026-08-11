/**
 * Builds a labelled evaluation set from DogFaceNet.
 *
 *   node eval/buildPairs.js [--queries 100] [--gallery 400] [--seed 42]
 *
 * DogFaceNet gives us the one thing breed datasets cannot: multiple photos of
 * the SAME individual dog. That is exactly the lost-vs-found problem — a photo
 * of your dog, matched against photos of dogs other people found.
 *
 * Output: eval/pairs.json
 *   queries  — one "lost dog" photo each, with the id of its true match
 *   gallery  — the "found dog" pool the matcher must rank; contains exactly one
 *              correct answer per query plus many distractors
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, 'data', 'after_4_bis');
const OUT = path.join(here, 'pairs.json');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
}

/** Deterministic RNG so a re-run produces the same set — otherwise the numbers move on their own. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Dataset not found at ${DATA_DIR}`);
    console.error('Download DogFaceNet_224resized.zip from https://zenodo.org/records/12578449');
    console.error('and unzip it into backend/eval/data/');
    process.exit(1);
  }

  const nQueries = arg('queries', 100);
  const nGallery = arg('gallery', 400);
  const rand = mulberry32(arg('seed', 42));

  // Only dogs with 2+ photos can be used: one goes in the query, one in the gallery.
  const dogs = fs
    .readdirSync(DATA_DIR)
    .map((id) => {
      const dir = path.join(DATA_DIR, id);
      if (!fs.statSync(dir).isDirectory()) return null;
      const images = fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
      return images.length >= 2 ? { id, dir, images } : null;
    })
    .filter(Boolean);

  console.log(`[pairs] ${dogs.length} dogs with 2+ photos`);
  if (dogs.length < nQueries) {
    console.error(`Only ${dogs.length} usable dogs, need ${nQueries}`);
    process.exit(1);
  }

  const shuffled = [...dogs].sort(() => rand() - 0.5);
  const queryDogs = shuffled.slice(0, nQueries);

  const queries = [];
  const gallery = [];

  for (const dog of queryDogs) {
    const imgs = [...dog.images].sort(() => rand() - 0.5);
    // Two DIFFERENT photos of the same dog — never the same file on both sides,
    // which would make this a trivial identity test rather than a matching test.
    queries.push({
      dogId: dog.id,
      imagePath: path.join(dog.dir, imgs[0]),
      truthId: `${dog.id}::${imgs[1]}`,
    });
    gallery.push({
      id: `${dog.id}::${imgs[1]}`,
      dogId: dog.id,
      imagePath: path.join(dog.dir, imgs[1]),
    });
  }

  // Distractors: photos of dogs that appear in no query, so a match against one
  // is unambiguously wrong.
  const distractorDogs = shuffled.slice(nQueries);
  let di = 0;
  while (gallery.length < nGallery && di < distractorDogs.length) {
    const dog = distractorDogs[di++];
    const img = dog.images[Math.floor(rand() * dog.images.length)];
    gallery.push({ id: `${dog.id}::${img}`, dogId: dog.id, imagePath: path.join(dog.dir, img) });
  }

  const out = {
    source: 'DogFaceNet_224resized (Zenodo 12578449, CC-BY-4.0)',
    builtAt: new Date().toISOString(),
    seed: arg('seed', 42),
    queries,
    gallery,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`[pairs] ${queries.length} queries, ${gallery.length} gallery images -> eval/pairs.json`);
  console.log(`[pairs] chance-level precision@1 would be ~${((1 / gallery.length) * 100).toFixed(2)}%`);
}

main();
