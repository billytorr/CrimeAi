// Agent registry — what CrimeAI can delegate, and what TORR could discover.
import type { CrimeAIAgent } from "./types";
import { ALL_AGENTS } from "./agents";

export function listAgents(): CrimeAIAgent[] { return ALL_AGENTS; }
export function availableAgents(): CrimeAIAgent[] { return ALL_AGENTS.filter((a) => a.available()); }
export function findAgent(id: string): CrimeAIAgent | undefined { return ALL_AGENTS.find((a) => a.id === id); }

/** Serialisable summary for /capabilities + a future TORR handshake. */
export function agentManifest() {
  return ALL_AGENTS.map((a) => ({
    id: a.id, name: a.name, description: a.description,
    capabilities: a.capabilities, available: a.available(),
  }));
}
