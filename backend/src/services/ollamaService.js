import { env } from '../config/env.js';

/**
 * Local vision model via Ollama, used as a fallback when Gemini is unavailable.
 *
 * Gemini's free tier allows 20 vision requests per day. On day 21 of a real
 * pilot, triage silently stops — and a report that arrives without analysis is
 * routed only on the reporter's own condition, losing breed, marks and the
 * urgency read. Ollama runs on your own machine with no quota, so the pipeline
 * keeps working when the cloud budget runs out.
 *
 * Slower and less accurate than Gemini, which is exactly why it is second in
 * the chain rather than first.
 */

const TIMEOUT_MS = 120000; // local vision models are slow on CPU

export function isOllamaConfigured() {
  return Boolean(env.ollama.baseUrl && env.ollama.model);
}

/** Cheap reachability check — Ollama being configured is not the same as running. */
export async function isOllamaReachable() {
  if (!isOllamaConfigured()) return false;
  try {
    const res = await fetch(`${env.ollama.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Lists installed models, so a misconfigured model name is a clear error. */
export async function listOllamaModels() {
  try {
    const res = await fetch(`${env.ollama.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const body = await res.json();
    return (body.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Runs the vision prompt against a local model.
 *
 * `imageBase64` is raw base64 with no data: prefix — Ollama rejects the prefix.
 */
export async function analyzeWithOllama({ imageBase64, prompt, schema }) {
  if (!isOllamaConfigured()) throw new Error('Ollama is not configured');

  const res = await fetch(`${env.ollama.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: env.ollama.model,
      messages: [{ role: 'user', content: prompt, images: [imageBase64] }],
      // Ollama enforces a JSON schema the same way Gemini does, so the same
      // schema object drives both providers and the parsed shape is identical.
      format: schema,
      stream: false,
      options: { temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 404) {
      const installed = await listOllamaModels();
      throw new Error(
        `Ollama model "${env.ollama.model}" is not installed. ` +
          (installed.length ? `Available: ${installed.join(', ')}` : 'Run: ollama pull llava')
      );
    }
    throw new Error(`Ollama request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const body = await res.json();
  const content = body?.message?.content;
  if (!content) throw new Error('Ollama returned an empty response');

  try {
    return JSON.parse(content);
  } catch {
    throw new Error('Ollama did not return valid JSON despite the schema');
  }
}
