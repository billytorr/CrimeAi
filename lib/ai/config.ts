// CrimeAI orchestration + integration mode. Standalone is production TODAY;
// the TORR/TCL flags exist only so the seams have something to read — none of
// them change behaviour until a later phase wires them up.
//
// Read from env with safe defaults, so an unset variable is exactly today's
// behaviour. See .env.example.

export type OrchestrationMode = "standalone" | "torr" | "hybrid";

export interface CrimeAIMode {
  orchestration: OrchestrationMode;
  torrEnabled: boolean;
  tclEnabled: boolean;
  tclShadow: boolean;
}

export function crimeaiMode(): CrimeAIMode {
  const m = (process.env.CRIMEAI_ORCHESTRATION_MODE || "standalone").toLowerCase();
  const orchestration: OrchestrationMode =
    m === "torr" ? "torr" : m === "hybrid" ? "hybrid" : "standalone";
  return {
    orchestration,
    // TORR never runs unless BOTH the flag is on AND a mode other than
    // standalone is selected — belt and braces so a stray env can't half-enable it.
    torrEnabled: process.env.TORR_ENABLED === "true" && orchestration !== "standalone",
    tclEnabled: process.env.TCL_ENABLED === "true",
    tclShadow: process.env.TCL_SHADOW_MODE !== "false", // shadow by default when TCL is on
  };
}

/** Which provider backs each capability. Env-selected; today only LLM resolves. */
export interface ProviderSelection {
  llm: string;
  stt: string;
  tts: string;
  vision: string;
  search: string;
  research: string;
  embedding: string;
}

export function providerSelection(): ProviderSelection {
  return {
    // "crimeai" = the built-in wrapper around lib/crimeai.ts (Anthropic/Ollama/fallback)
    llm: process.env.CRIMEAI_LLM_PROVIDER || "crimeai",
    stt: process.env.CRIMEAI_STT_PROVIDER || "none",
    tts: process.env.CRIMEAI_TTS_PROVIDER || "none",
    vision: process.env.CRIMEAI_VISION_PROVIDER || "none",
    search: process.env.CRIMEAI_SEARCH_PROVIDER || "none",
    research: process.env.CRIMEAI_RESEARCH_PROVIDER || "none",
    embedding: process.env.CRIMEAI_EMBEDDING_PROVIDER || "none",
  };
}
