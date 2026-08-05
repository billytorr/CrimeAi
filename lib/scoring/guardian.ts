// Guardian Score (Layer 2) — MODULE BOUNDARY PLACEHOLDER (Phase 7).
// The strict boundary exists from Phase 4 so the NSS can never grow a
// dependency on reputation: NSS (nss.ts) must never import this module, and
// this module must never import nss.ts. Guardian Score MAY read entitlement
// state in later phases (the Protector flip) — NSS never may.
//
// Phase 7 implements: ContributionValue × AccuracyFactor ×
// IdentityTrustMultiplier − Penalties, × DecayFactor, with vesting.

export interface GuardianScoreResult {
  score: number;           // 0-1000
  explanation: Record<string, unknown>;
}

export function computeGuardianScore(): GuardianScoreResult {
  throw new Error("Guardian Score is Phase 7 — not implemented yet (boundary stub)");
}
