// CrimeAI Tool Registry.
//
// Registers ONLY tools that actually exist today (master prompt §21: "Only
// register tools that actually exist"). Right now that is the crime-data
// grounding the assistant already uses. Voice/vision/web tools are declared
// as NOT available so the manifest is honest and a later phase flips them on
// by registering an implementation.
//
// Every tool carries the permission + risk metadata the prompt requires, so
// when TORR eventually discovers capabilities it sees the safety envelope too.

export type RiskLevel = "read" | "write" | "external_write" | "high_risk";
export type Permission = "READ" | "WRITE" | "EXTERNAL_WRITE" | "FINANCIAL" | "IDENTITY" | "BIOMETRIC" | "ADMIN";

export interface ToolSpec {
  name: string;
  version: string;
  description: string;
  permissions: Permission[];
  risk: RiskLevel;
  timeoutMs: number;
  provider: string;      // which subsystem/provider backs it
  available: boolean;    // false = declared but not implemented yet
}

// Only real tools. `available: false` entries are the honest "coming in a
// later phase" placeholders the manifest needs, not fake capabilities.
export const TOOLS: ToolSpec[] = [
  {
    name: "crime.lookup", version: "1.0",
    description: "Resolve a place and return grounded incident stats, NSS, and recent reports for it.",
    permissions: ["READ"], risk: "read", timeoutMs: 30_000, provider: "crimeai-data", available: true,
  },
  {
    name: "crime.ask", version: "1.0",
    description: "Answer a public-safety question grounded in the resolved area's data.",
    permissions: ["READ"], risk: "read", timeoutMs: 60_000, provider: "crimeai-llm", available: true,
  },
  // ── declared, not yet implemented (later phases) ──
  { name: "web.search", version: "0", description: "External web search.", permissions: ["READ", "EXTERNAL_WRITE"], risk: "external_write", timeoutMs: 20_000, provider: "none", available: false },
  { name: "web.research", version: "0", description: "Deep web research/extraction.", permissions: ["READ", "EXTERNAL_WRITE"], risk: "external_write", timeoutMs: 60_000, provider: "none", available: false },
  { name: "vision.analyze", version: "0", description: "Analyse an uploaded image/document.", permissions: ["READ"], risk: "read", timeoutMs: 60_000, provider: "none", available: false },
  { name: "voice.transcribe", version: "0", description: "Speech to text.", permissions: ["READ"], risk: "read", timeoutMs: 60_000, provider: "none", available: false },
  { name: "voice.synthesize", version: "0", description: "Text to speech.", permissions: ["READ"], risk: "read", timeoutMs: 30_000, provider: "none", available: false },
];

export const availableTools = (): ToolSpec[] => TOOLS.filter((t) => t.available);
export const findTool = (name: string): ToolSpec | undefined => TOOLS.find((t) => t.name === name);
