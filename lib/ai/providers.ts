// AI provider INTERFACES — the Model Gateway contract.
//
// Per the master prompt §10: no CrimeAI module should hard-code itself to a
// vendor. These are the seams. Only the LLM interface has an implementation
// today (it wraps lib/crimeai.ts); the rest are declared so later phases drop
// a provider in without touching callers, and so the capability manifest can
// honestly report "not configured" for each.
//
// ⚠️ No implementations for STT/TTS/Vision/Search/Research/Embedding are added
// here — the prompt is explicit: do not create fake provider behaviour.

export interface ProviderMeta {
  /** e.g. "anthropic", "deepgram" — or "none" when unconfigured */
  name: string;
  configured: boolean;
}

// ── LLM ─────────────────────────────────────────────────────────────
export interface LLMRequest {
  question: string;
  context: string;            // grounded data block
  system?: string;            // Command Center system prompt
  userContext?: string;       // per-user personalisation
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
export interface LLMResult { answer: string; engine: string }
export interface LLMProvider extends ProviderMeta {
  complete(req: LLMRequest): Promise<LLMResult>;
}

// ── Speech-to-text ──────────────────────────────────────────────────
export interface STTResult { text: string; durationSec?: number }
export interface STTProvider extends ProviderMeta {
  transcribe(audio: Blob | ArrayBuffer, opts?: { language?: string }): Promise<STTResult>;
}

// ── Text-to-speech ──────────────────────────────────────────────────
export interface TTSResult { audio: ArrayBuffer; contentType: string; durationSec?: number }
export interface TTSProvider extends ProviderMeta {
  synthesize(text: string, opts?: { voice?: string }): Promise<TTSResult>;
}

// ── Vision ──────────────────────────────────────────────────────────
export interface VisionResult { description: string; objects?: string[] }
export interface VisionProvider extends ProviderMeta {
  analyze(image: Blob | ArrayBuffer | string, prompt?: string): Promise<VisionResult>;
}

// ── Web search / research ───────────────────────────────────────────
export interface SearchHit { title: string; url: string; snippet?: string }
export interface SearchProvider extends ProviderMeta {
  search(query: string, opts?: { limit?: number }): Promise<SearchHit[]>;
}
export interface ResearchResult { summary: string; sources: SearchHit[] }
export interface ResearchProvider extends ProviderMeta {
  research(query: string): Promise<ResearchResult>;
}

// ── Embeddings ──────────────────────────────────────────────────────
export interface EmbeddingProvider extends ProviderMeta {
  embed(texts: string[]): Promise<number[][]>;
}

/** A provider that isn't configured — used everywhere a real one doesn't exist yet. */
export function unconfigured(name = "none"): ProviderMeta {
  return { name, configured: false };
}
