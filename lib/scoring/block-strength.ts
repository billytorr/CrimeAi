// Block Strength (Layer 3) — MODULE BOUNDARY PLACEHOLDER (Phase 9).
// Measures how well-watched a place is. CRIME RATE IS EXPLICITLY NOT AN
// INPUT (spec Layer 3) — therefore this module must never import nss.ts or
// any incident/hazard data, and a CI test will assert that in Phase 9.
//
// Phase 9 implements: 0.35·Coverage + 0.20·Responsiveness +
// 0.15·CorroborationRate + 0.15·TemporalCoverage + 0.10·CircleDensity +
// 0.05·VerifiedShare.

export interface BlockStrengthResult {
  score: number;           // 0-100
  explanation: Record<string, unknown>;
}

export function computeBlockStrength(): BlockStrengthResult {
  throw new Error("Block Strength is Phase 9 — not implemented yet (boundary stub)");
}
