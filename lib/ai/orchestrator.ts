// CrimeAI Orchestrator — the seam the master prompt §7 asks for.
//
// The StandaloneCrimeAIOrchestrator is the ONLY implementation active today.
// It routes an LLM request through the Model Gateway (which wraps the existing
// lib/crimeai.ts), emits events, and reports health/capabilities. It does NOT
// replace app/api/crimeai/ask — that route keeps working exactly as it does.
// This is the forward-looking entry point that /health, /capabilities and a
// future TORR adapter report on, and that the Ask route MAY delegate to in a
// later phase.
//
// ROLLBACK: nothing imports this on a hot path yet, so deleting it changes no
// user-facing behaviour.

import { gateway } from "./gateway";
import { buildManifest, type CapabilityManifest } from "./capabilities";
import { crimeaiMode } from "./config";
import { emitEvent } from "./events";
import type { LLMRequest, LLMResult } from "./providers";

export interface HealthStatus {
  ok: boolean;
  mode: string;
  llmConfigured: boolean;
  torr: { enabled: boolean; reachable: boolean };
  at: number;
}

export interface CrimeAIOrchestrator {
  ask(req: LLMRequest, requestId?: string): Promise<LLMResult>;
  getCapabilities(): CapabilityManifest;
  health(): HealthStatus;
}

class StandaloneCrimeAIOrchestrator implements CrimeAIOrchestrator {
  async ask(req: LLMRequest, requestId?: string): Promise<LLMResult> {
    emitEvent("crimeai.request.received", { hasUserContext: !!req.userContext }, requestId);
    try {
      const result = await gateway.llm().complete(req);
      emitEvent("crimeai.llm.completed", { engine: result.engine }, requestId);
      return result;
    } catch (e) {
      emitEvent("crimeai.error", { message: (e as Error).message }, requestId);
      throw e;
    }
  }

  getCapabilities(): CapabilityManifest { return buildManifest(); }

  health(): HealthStatus {
    const mode = crimeaiMode();
    return {
      ok: true,
      mode: mode.orchestration,
      llmConfigured: gateway.llm().configured,
      // TORR is never reachable today — the adapter is a disabled boundary.
      torr: { enabled: mode.torrEnabled, reachable: false },
      at: Date.now(),
    };
  }
}

// Single instance. When hybrid/torr modes arrive they select a different
// implementation here; standalone is the permanent fallback.
export function orchestrator(): CrimeAIOrchestrator {
  // Even if the mode is "torr" or "hybrid", we return standalone until a real
  // TORR adapter is built — the prompt forbids fake TORR behaviour, and
  // CrimeAI must never be unusable because TORR isn't ready.
  return new StandaloneCrimeAIOrchestrator();
}
