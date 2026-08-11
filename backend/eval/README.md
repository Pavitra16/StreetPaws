# Matching evaluation

Measures whether the lost-dog photo matcher actually works, instead of assuming it does.

## Why this exists

Before this harness, the matcher looked plausible — it returned sensible-seeming
results — but nobody could say how often it was right. That is not a usable
claim, and it hides regressions: a change that halves accuracy looks identical
to one that doubles it if all you do is eyeball a result list.

## Dataset

[DogFaceNet](https://zenodo.org/records/12578449) (`DogFaceNet_224resized.zip`,
76 MB, CC-BY-4.0). 1,393 folders, one per **individual dog**, 8,363 aligned
224×224 face images.

Individual identity is the point. Breed datasets like Stanford Dogs contain many
Labradors but rarely several photos of *one* Labrador — and "is this the same
animal" is exactly the question a lost-dog search asks.

The data is gitignored (`eval/data/`). To reproduce:

```bash
curl -L -o eval/data/DogFaceNet_224resized.zip \
  "https://zenodo.org/records/12578449/files/DogFaceNet_224resized.zip?download=1"
cd eval/data && unzip DogFaceNet_224resized.zip
```

## Running it

```bash
node eval/buildPairs.js --queries 120 --gallery 500   # build a labelled set
node eval/embedPairs.js                               # embed with CLIP (cached)
node eval/score.js                                    # report metrics
```

`buildPairs` uses a seeded RNG, so re-running produces the same set — otherwise
the numbers drift on their own and you cannot tell a real change from noise.

Embedding is split from scoring because embedding 620 images takes minutes while
scoring takes milliseconds. Cache once, re-score freely.

To compare an alternative encoder:

```bash
node eval/embedPairs.js --model Xenova/clip-vit-base-patch16
node eval/score.js     # scores every encoder that has been embedded
```

## Task setup

Each query is one photo of a dog. The gallery holds a **different** photo of that
same dog plus 499 distractors — dogs that appear in no query, so a match against
one is unambiguously wrong. Query and answer are never the same file, which would
make this an identity check rather than a matching test.

Random guessing scores **P@1 ≈ 0.2%**.

## Results

120 queries, 500 gallery images, seed 42.

| Encoder | P@1 | R@5 | R@10 | MRR | Median rank |
|---|---|---|---|---|---|
| `clip-vit-base-patch16` | **49.2%** | **68.3%** | **73.3%** | **0.581** | 2 |
| `clip-vit-base-patch32` | 48.3% | 65.8% | 69.2% | 0.554 | 2 |
| Random baseline | 0.2% | 1.0% | 2.0% | — | 250 |

**Reading these.** The correct dog is ranked first about half the time and is on
screen (top 12) roughly three quarters of the time — against a 1-in-500 chance
baseline, so the visual signal is carrying real information, not noise. A median
rank of 2 says that when it is wrong, it is usually only just wrong.

**Encoder decision.** patch16 wins on every metric, at ~2.6× the compute
(2.6 img/s vs 7.1 img/s locally). Embedding runs once per report, asynchronously,
off the request path — so latency is not a user-visible cost here and the accuracy
is worth having. Production uses patch16 on that basis.

## What this does NOT measure

Stated plainly, because a benchmark quoted beyond its scope is worse than none:

- **Visual similarity only.** The production scorer also weighs breed/colour/marks
  (0.25), geographic distance (0.15) and a date window (0.10). DogFaceNet has no
  location or time, so those cannot be measured here. Real-world accuracy should
  be *higher* than these numbers — a dog found 2 km away yesterday is a far
  stronger signal than pixels alone.
- **Domain gap.** These are cropped, aligned, well-lit face shots. Real reports
  are whole-body photos taken on a phone, often at distance, sometimes at dusk.
  Expect worse on real traffic.
- **Breed distribution.** DogFaceNet skews toward Western pedigree breeds. Indian
  street dogs are overwhelmingly Indian Pariah — a visually *more* homogeneous
  population, which likely makes the real task harder.

The honest summary: this is a floor for the visual component under favourable
imaging conditions, not an estimate of end-to-end product accuracy.

## Next

- Score the full hybrid scorer (visual + attributes + geo + time) once there is
  real report data with locations and timestamps to evaluate against.
- Evaluate triage urgency separately using [PetFinder.my](https://www.kaggle.com/c/petfinder-adoption-prediction/data),
  which has real shelter photos with a `Health` field (healthy / minor injury /
  serious injury).
