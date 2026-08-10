// Model Gateway — the single place capabilities resolve to a provider.
//
// TODAY it resolves exactly one thing: the LLM, which wraps the EXISTING
// lib/crimeai.ts (Anthropic → Ollama → deterministic fallback), so behaviour
// is byte-for-byte what it is now. Every other capability resolves to an
// unconfigured stub that reports `configured: false` and throws if called —
// which is honest, not fake.
//
// COMPATIBILITY: this is additive. lib/crimeai.ts is untouched; the gateway
// calls it. Nothing that imports askCrimeAI directly is affected.
// ROLLBACK: stop importing the gateway — askCrimeAI still works standalone.

import { askCrimeAI } from "@/lib/crimeai";
import { providerSelection } from "./config";
import type {
  LLMProvider, LLMRequest, LLMResult,
  STTProvider, TTSProvider, VisionProvider, SearchProvider, ResearchProvider, EmbeddingProvider,
} from "./providers";

// ── the built-in LLM provider: a thin wrapper over lib/crimeai.ts ──
const crimeaiLLM: LLMProvider = {
  name: "crimeai",
  configured: !!process.env.ANTHROPIC_API_KEY, // Anthropic path; falls back regardless
  async complete(req: LLMRequest): Promise<LLMResult> {
    const { answer, engine } = await askCrimeAI(req.question, req.context, {
      model: req.model, temperature: req.temperature, maxTokens: req.maxTokens,
      system: req.system, userContext: req.userContext,
    });
    return { answer, engine };
  },
};

// ── stubs for capabilities with no provider yet ────────────────────
// They exist so callers and the manifest can ask "is this available?" and get
// an honest no, rather than the capability simply not existing.
// async so the rejection surfaces as a rejected promise, matching the real
// provider signatures — a caller awaiting it gets a catchable error, not a
// synchronous throw mid-expression.
const notReady = (cap: string) => async (): Promise<never> => { throw new Error(`${cap} provider not configured`); };
const stub = <T extends object>(name: string, methods: T): T & { name: string; configured: boolean } =>
  ({ name: "none", configured: false, ...methods });

export const gateway = {
  llm(): LLMProvider {
    // Only "crimeai" is implemented; any other selection falls back to it
    // rather than breaking, until that provider is built in a later phase.
    return crimeaiLLM;
  },
  stt(): STTProvider {
    if (process.env.DEEPGRAM_API_KEY) {
      const { deepgramSTT } = require("./voice/deepgram-stt");
      return deepgramSTT();
    }
    return stub("stt", { transcribe: notReady("STT") }) as STTProvider;
  },
  tts(): TTSProvider {
    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) {
      const { elevenlabsTTS } = require("./voice/elevenlabs-tts");
      return elevenlabsTTS();
    }
    return stub("tts", { synthesize: notReady("TTS") }) as TTSProvider;
  },
  vision(): VisionProvider {
    // Real provider when Anthropic is configured (it's vision-capable); the
    // honest stub otherwise. No new vendor — same key as the LLM.
    if (process.env.ANTHROPIC_API_KEY) {
      // lazy import so the SDK isn't pulled when vision is unused
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { anthropicVision } = require("./vision/anthropic-vision");
      return anthropicVision();
    }
    return stub("vision", { analyze: notReady("Vision") }) as VisionProvider;
  },
  search(): SearchProvider {
    if (process.env.BRAVE_API_KEY) {
      const { braveSearch } = require("./web/brave-search");
      return braveSearch();
    }
    return stub("search", { search: notReady("Search") }) as SearchProvider;
  },
  research(): ResearchProvider {
    if (process.env.TAVILY_API_KEY) {
      const { tavilyResearch } = require("./web/tavily-research");
      return tavilyResearch();
    }
    return stub("research", { research: notReady("Research") }) as ResearchProvider;
  },
  embedding(): EmbeddingProvider { return stub("embedding", { embed: notReady("Embedding") }) as EmbeddingProvider; },

  /** What each capability currently resolves to — for /capabilities + the manifest. */
  status() {
    const sel = providerSelection();
    return {
      llm: { provider: this.llm().name, configured: this.llm().configured, selected: sel.llm },
      stt: { provider: this.stt().name, configured: this.stt().configured, selected: sel.stt },
      tts: { provider: this.tts().name, configured: this.tts().configured, selected: sel.tts },
      vision: { provider: this.vision().name, configured: this.vision().configured, selected: sel.vision },
      search: { provider: this.search().name, configured: this.search().configured, selected: sel.search },
      research: { provider: this.research().name, configured: this.research().configured, selected: sel.research },
      embedding: { provider: "none", configured: false, selected: sel.embedding },
    };
  },
};
