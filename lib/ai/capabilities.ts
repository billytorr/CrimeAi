// CrimeAI Capability Manifest — generated from ACTUAL implementation, never
// hand-listed (master prompt §9). This is what CrimeAI would eventually
// advertise to TORR during the handshake, and what /api/crimeai/capabilities
// returns today.

import { gateway } from "./gateway";
import { availableTools, TOOLS } from "./tools";
import { crimeaiMode } from "./config";

export interface CapabilityManifest {
  system: "crimeai";
  version: string;
  mode: string;
  capabilities: string[];    // only what genuinely works today
  planned: string[];         // declared, not yet implemented
  providers: ReturnType<typeof gateway.status>;
  tools: { available: string[]; planned: string[] };
  torr: { enabled: boolean; level: number };
}

export function buildManifest(): CapabilityManifest {
  const mode = crimeaiMode();
  const providers = gateway.status();

  // Capabilities are derived: a thing is a capability only if a tool for it
  // is available AND its provider is configured.
  const caps: string[] = [];
  if (availableTools().some((t) => t.name === "crime.lookup")) caps.push("crime_data_lookup");
  if (availableTools().some((t) => t.name === "crime.ask") && providers.llm.configured) caps.push("crime_qa");
  caps.push("area_safety_scoring"); // NSS is always available (deterministic)

  const planned = TOOLS.filter((t) => !t.available).map((t) => t.name);

  return {
    system: "crimeai",
    version: "1.0",
    mode: mode.orchestration,
    capabilities: caps,
    planned,
    providers,
    tools: {
      available: availableTools().map((t) => t.name),
      planned,
    },
    // TORR maturity level (master prompt §42): 0 = disconnected. Today, always 0.
    torr: { enabled: mode.torrEnabled, level: mode.torrEnabled ? 1 : 0 },
  };
}
