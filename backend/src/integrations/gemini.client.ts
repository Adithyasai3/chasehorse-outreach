import { AppError } from '../lib/errors';
import { getApiKey, logProviderCall } from '../services/credentials.service';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 90_000;

export interface GroundingSource {
  title: string;
  url: string;
}

export interface GeminiTextResult {
  text: string;
  sources: GroundingSource[];
  /** Text segments Google attributed to specific sources (indexes into sources). */
  supports: { text: string; sourceIndexes: number[] }[];
  searchQueries: string[];
  usage: { promptTokens: number; outputTokens: number };
}

async function geminiFetch(apiKey: string, path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, ...(init.headers || {}) },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new AppError('PROVIDER_ERROR', 'Gemini did not respond in time.', { provider: 'GEMINI' });
    throw new AppError('PROVIDER_ERROR', `Could not reach Gemini: ${(err as Error).message}`, { provider: 'GEMINI' });
  } finally {
    clearTimeout(timer);
  }
}

async function toError(res: Response): Promise<AppError> {
  let message = `HTTP ${res.status}`;
  let reason = '';
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string; details?: { reason?: string }[] } };
    message = body.error?.message || message;
    reason = body.error?.details?.find((d) => d.reason)?.reason || body.error?.status || '';
  } catch {
    /* non-JSON body */
  }
  if (reason === 'API_KEY_INVALID' || res.status === 401 || res.status === 403) {
    return new AppError('PROVIDER_AUTH', 'Gemini rejected the API key. Check it in Settings → Integrations.', { provider: 'GEMINI' });
  }
  if (res.status === 429) {
    return new AppError('PROVIDER_RATE_LIMIT', 'Gemini quota or rate limit reached. Retry shortly or check your Google AI Studio quota.', {
      provider: 'GEMINI',
    });
  }
  if (res.status === 404) {
    return new AppError('VALIDATION', `Gemini model not found: ${message}`, { provider: 'GEMINI' });
  }
  return new AppError('PROVIDER_ERROR', `Gemini error: ${message}`, { provider: 'GEMINI' });
}

/** Validates a key by listing models. Returns available generateContent model ids. */
export async function validateGeminiKey(apiKey: string): Promise<string[]> {
  const res = await geminiFetch(apiKey, '/models?pageSize=100', { method: 'GET' });
  if (!res.ok) throw await toError(res);
  const body = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (body.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));
}

interface GenerateOptions {
  userId: string;
  model: string;
  operation: string;
  prompt: string;
  system?: string;
  /** Enables Google Search grounding. Cannot be combined with jsonSchema. */
  grounded?: boolean;
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
}

interface RawCandidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
  groundingMetadata?: {
    groundingChunks?: { web?: { uri?: string; title?: string } }[];
    webSearchQueries?: string[];
    groundingSupports?: { segment?: { text?: string }; groundingChunkIndices?: number[] }[];
  };
}

export async function generate(opts: GenerateOptions): Promise<GeminiTextResult> {
  const apiKey = await getApiKey(opts.userId, 'GEMINI');
  const startedAt = Date.now();
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      ...(opts.jsonSchema ? { responseMimeType: 'application/json', responseSchema: opts.jsonSchema } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  if (opts.grounded) body.tools = [{ google_search: {} }];

  const res = await geminiFetch(apiKey, `/models/${encodeURIComponent(opts.model)}:generateContent`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await toError(res);
    await logProviderCall({ userId: opts.userId, provider: 'GEMINI', operation: opts.operation, status: err.code, startedAt, detail: err.message });
    throw err;
  }
  const json = (await res.json()) as {
    candidates?: RawCandidate[];
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) {
    const reason = json.promptFeedback?.blockReason || candidate?.finishReason || 'empty response';
    await logProviderCall({ userId: opts.userId, provider: 'GEMINI', operation: opts.operation, status: 'EMPTY', startedAt, detail: reason });
    throw new AppError('PROVIDER_ERROR', `Gemini returned no content (${reason}).`, { provider: 'GEMINI' });
  }

  const sources: GroundingSource[] = [];
  const chunkToSource = new Map<number, number>();
  (candidate?.groundingMetadata?.groundingChunks || []).forEach((chunk, chunkIndex) => {
    const url = chunk.web?.uri;
    if (!url) return;
    let idx = sources.findIndex((s) => s.url === url);
    if (idx < 0) {
      sources.push({ url, title: chunk.web?.title || url });
      idx = sources.length - 1;
    }
    chunkToSource.set(chunkIndex, idx);
  });
  const supports = (candidate?.groundingMetadata?.groundingSupports || [])
    .map((s) => ({
      text: (s.segment?.text || '').trim(),
      sourceIndexes: [...new Set((s.groundingChunkIndices || []).map((i) => chunkToSource.get(i)).filter((i): i is number => i !== undefined))],
    }))
    .filter((s) => s.text.length > 0 && s.sourceIndexes.length > 0);

  await logProviderCall({ userId: opts.userId, provider: 'GEMINI', operation: opts.operation, status: 'OK', startedAt });
  return {
    text,
    sources,
    supports,
    searchQueries: candidate?.groundingMetadata?.webSearchQueries || [],
    usage: {
      promptTokens: json.usageMetadata?.promptTokenCount || 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

/** Calls Gemini in JSON mode and parses the result. */
export async function generateJson<T>(opts: Omit<GenerateOptions, 'grounded'> & { jsonSchema: Record<string, unknown> }): Promise<T> {
  const result = await generate({ ...opts, grounded: false });
  try {
    return JSON.parse(result.text) as T;
  } catch {
    throw new AppError('PROVIDER_ERROR', 'Gemini returned malformed JSON. Try again.', { provider: 'GEMINI' });
  }
}
