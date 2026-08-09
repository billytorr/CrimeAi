// CrimeAI runtime config, loaded from the ai_config table (Command Center).
//
// Cached briefly so a busy Ask endpoint isn't hitting the DB on every message,
// but short enough that an admin edit shows up within a minute. Falls back to
// safe defaults if the table isn't there yet, so the assistant never hard-
// fails on a fresh database.

export interface AiConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  freeMonthlyMessages: number;
  protectorMonthlyMessages: number;
  protectorVoiceMinutes: number;
  protectorUploads: number;
  protectorWebSearches: number;
  freeWebSearch: boolean;
  upsellLine: string;
}

const DEFAULTS: AiConfig = {
  model: process.env.CRIMEAI_MODEL || "claude-sonnet-4-5",
  temperature: 0.4,
  maxTokens: 1200,
  systemPrompt: "", // empty → caller uses the built-in CRIMEAI_SYSTEM
  freeMonthlyMessages: 15,
  protectorMonthlyMessages: 1000,
  protectorVoiceMinutes: 300,
  protectorUploads: 200,
  protectorWebSearches: 500,
  freeWebSearch: false,
  upsellLine: "That's a Protector feature. Want me to show you the plan?",
};

let cache: { at: number; cfg: AiConfig } | null = null;
const TTL_MS = 60_000;

export async function loadAiConfig(): Promise<AiConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  try {
    const { serverDb } = await import("@/lib/payments/serverdb");
    const { data } = await serverDb(true).rpc("ai_config_all");
    const raw = (data || {}) as Record<string, unknown>;
    const cfg: AiConfig = {
      model: str(raw.model, DEFAULTS.model),
      temperature: num(raw.temperature, DEFAULTS.temperature),
      maxTokens: num(raw.max_tokens, DEFAULTS.maxTokens),
      systemPrompt: str(raw.system_prompt, DEFAULTS.systemPrompt),
      freeMonthlyMessages: num(raw.free_monthly_messages, DEFAULTS.freeMonthlyMessages),
      protectorMonthlyMessages: num(raw.protector_monthly_messages, DEFAULTS.protectorMonthlyMessages),
      protectorVoiceMinutes: num(raw.protector_voice_minutes, DEFAULTS.protectorVoiceMinutes),
      protectorUploads: num(raw.protector_uploads, DEFAULTS.protectorUploads),
      protectorWebSearches: num(raw.protector_web_searches, DEFAULTS.protectorWebSearches),
      freeWebSearch: raw.free_web_search === true,
      upsellLine: str(raw.upsell_line, DEFAULTS.upsellLine),
    };
    cache = { at: Date.now(), cfg };
    return cfg;
  } catch {
    return DEFAULTS;
  }
}

const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
