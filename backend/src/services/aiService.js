import { GoogleGenAI } from '@google/genai';
import { env, featureStatus } from '../config/env.js';
import { buildUrl, ANALYSIS } from '../config/cloudinary.js';
import { analyzeWithOllama, isOllamaConfigured } from './ollamaService.js';

let client = null;
function getClient() {
  if (!featureStatus().gemini) return null;
  client ??= new GoogleGenAI({ apiKey: env.gemini.apiKey });
  return client;
}

export function isAiConfigured() {
  return featureStatus().gemini || isOllamaConfigured();
}

/**
 * True for failures where trying a different provider makes sense: quota,
 * rate limits, outages. A 400 caused by our own request shape would fail
 * identically everywhere, so it is not worth a second attempt.
 */
function shouldFallOver(err) {
  const msg = String(err?.message ?? '');
  return /429|RESOURCE_EXHAUSTED|quota|rate limit|\b50[0234]\b|overloaded|fetch failed|ETIMEDOUT|ECONNREFUSED|not configured/i.test(
    msg
  );
}

/**
 * Single source of truth for the analysis shape. Gemini enforces this on the way
 * out, and models/DogReport.js stores exactly these fields — keeping them in one
 * place is what stops the two from quietly drifting apart.
 */
export const DOG_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    // Guards against a mis-tagged upload quietly entering the rescuer queue as a
    // low-urgency case. It is better to tell the reporter their photo did not
    // work than to file a report nobody can act on.
    isDog: { type: 'boolean', description: 'True only if a real dog is visible in the photo.' },
    breed: { type: 'string', description: 'Most likely breed. Indian street dogs are usually "Indian Pariah".' },
    breedConfidence: { type: 'number', description: 'Confidence 0-1 in the breed call.' },
    colors: { type: 'array', items: { type: 'string' }, description: 'Main coat colours, e.g. ["tan","white chest"].' },
    coatPattern: { type: 'string', description: 'Short description of coat length and pattern.' },
    sizeEstimate: { type: 'string', enum: ['small', 'medium', 'large', 'unknown'] },
    ageEstimate: { type: 'string', enum: ['puppy', 'young', 'adult', 'senior', 'unknown'] },
    distinctiveMarks: {
      type: 'array',
      items: { type: 'string' },
      description: 'Permanent identifying features useful for matching a lost dog: scars, torn ears, unusual markings, collar.',
    },
    injuries: {
      type: 'array',
      items: { type: 'string' },
      description: 'Visible injuries or signs of illness. Empty array if the dog appears healthy.',
    },
    urgency: { type: 'integer', description: '1 healthy, 2 minor, 3 needs care soon, 4 urgent, 5 life-threatening.' },
    generatedDescription: { type: 'string', description: '2-3 plain sentences describing the dog and its condition.' },
  },
  required: ['isDog', 'breed', 'colors', 'sizeEstimate', 'ageEstimate', 'urgency', 'generatedDescription', 'injuries', 'distinctiveMarks'],
};

const PROMPT = `You are helping an Indian street-dog rescue service triage incoming reports.

Look at the photo and describe the dog factually.

Urgency scale — this orders a rescuer's queue, so be accurate rather than cautious:
5 = life-threatening now: heavy bleeding, unable to stand, severe trauma, extreme emaciation
4 = urgent, same-day: open wounds, clear limping, unweaned puppies alone, severe mange
3 = needs care in a few days: skin disease, visible infection, moderate malnutrition
2 = minor issue or unclear, worth a look
1 = appears healthy

Rules:
- If the photo does not clearly show a real dog, set isDog to false, urgency to 1, and say so plainly in generatedDescription. Do not invent a dog.
- Describe only what is visible. Do not guess at internal injuries or diagnoses.
- Most Indian street dogs are "Indian Pariah" — do not force a pedigree breed onto one.
- distinctiveMarks should be things that would still identify this dog in a month.
- Write generatedDescription in plain language a volunteer would use, no medical jargon.`;

/**
 * Runs the vision pass over a report's primary photo.
 * Returns the analysis object, or throws — the caller decides how to record failure.
 */
export async function analyzeDogPhoto({ publicId, imageUrl: directUrl, resourceType = 'image', language = 'en' }) {
  // Provider availability is decided by the chain below — Ollama alone is a
  // valid setup, so a missing Gemini key must not fail the call here.
  if (!isAiConfigured()) {
    throw new Error('No vision provider configured (set GEMINI_API_KEY or OLLAMA_BASE_URL)');
  }
  if (resourceType !== 'image') throw new Error('Only images can be analysed');
  if (!publicId && !directUrl) throw new Error('Provide either publicId or imageUrl');

  // Prefer a Cloudinary-downsized copy: a 4 MB phone photo costs meaningfully
  // more per call and adds nothing to accuracy at this task. A direct URL is
  // used as-is, for ad-hoc matching against a photo we have not stored.
  const imageUrl = publicId ? buildUrl(publicId, ANALYSIS) : directUrl;

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Could not fetch image for analysis (${res.status})`);
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
  const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');

  const prompt =
    language === 'hi'
      ? `${PROMPT}\n\nWrite generatedDescription in Hindi (Devanagari). All other fields stay in English.`
      : PROMPT;

  /**
   * Provider chain: Gemini first for accuracy, local Ollama second so the
   * pipeline survives the 20-requests-per-day free-tier ceiling. Whichever
   * answers, the shape returned below is identical.
   */
  let parsed;
  let modelUsed;

  const tryGemini = async () => {
    const ai = getClient();
    if (!ai) throw new Error('Gemini is not configured');
    const result = await ai.models.generateContent({
      model: env.gemini.model,
      contents: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }],
      config: { responseMimeType: 'application/json', responseSchema: DOG_ANALYSIS_SCHEMA },
    });
    parsed = JSON.parse(result.text);
    modelUsed = env.gemini.model;
  };

  const tryOllama = async () => {
    parsed = await analyzeWithOllama({
      imageBase64: base64,
      prompt,
      schema: DOG_ANALYSIS_SCHEMA,
    });
    modelUsed = `ollama:${env.ollama.model}`;
  };

  try {
    await tryGemini();
  } catch (geminiError) {
    if (!isOllamaConfigured() || !shouldFallOver(geminiError)) throw geminiError;

    console.warn(
      `[ai] Gemini unavailable (${String(geminiError.message).slice(0, 80)}) — falling back to Ollama`
    );
    try {
      await tryOllama();
      console.log(`[ai] analysed locally with ${modelUsed}`);
    } catch (ollamaError) {
      // Surface both, or the log shows a confusing local error for what was
      // actually a cloud quota problem.
      throw new Error(
        `Both providers failed. Gemini: ${geminiError.message?.slice(0, 120)} | Ollama: ${ollamaError.message?.slice(0, 120)}`
      );
    }
  }

  return {
    isDog: parsed.isDog !== false,
    breed: parsed.breed,
    breedConfidence: clamp01(parsed.breedConfidence),
    colors: parsed.colors ?? [],
    coatPattern: parsed.coatPattern,
    sizeEstimate: parsed.sizeEstimate ?? 'unknown',
    ageEstimate: parsed.ageEstimate ?? 'unknown',
    distinctiveMarks: parsed.distinctiveMarks ?? [],
    injuries: parsed.injuries ?? [],
    // The schema says integer 1-5, but a model can still emit 0 or 7. Clamp
    // rather than trust — this value orders a queue of injured animals.
    urgency: Math.min(5, Math.max(1, Math.round(parsed.urgency ?? 1))),
    generatedDescription: parsed.generatedDescription,
    // Records which provider actually answered, so a report analysed by the
    // local fallback is distinguishable when reviewing quality later.
    modelUsed,
    analyzedAt: new Date(),
  };
}

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return undefined;
  return Math.min(1, Math.max(0, n));
}
