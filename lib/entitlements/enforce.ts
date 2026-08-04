// Enforcement wrapper — the ONE function feature routes call to gate a
// capability. It layers a global KILL SWITCH on top of EntitlementService:
//
//   • Kill switch OFF (enforcement_flags.default.enabled = false): non-cost
//     capabilities are NOT gated (everyone gets full access). Lets us ship
//     enforcement dormant and flip it on when ready, or break-glass-disable it
//     instantly if gating ever misbehaves.
//   • Cost paths (ai_analytical, sms_immediate) are ALWAYS enforced, kill
//     switch or not — the switch must never open unbounded spend (Rule 3).
//
// Rule 1 still holds ABOVE this layer: safety paths never call enforce() at all.
import { CAP_META, type Capability } from "./capabilities";
import { EntitlementService } from "./service";
import type { DecideResult } from "./decide";

let flagCache: { at: number; on: boolean } | null = null;
const FLAG_TTL_MS = 30_000;

// Is non-cost gating currently enabled? Reads the kill switch. On any read
// error, default to NOT gating non-cost features (fail-open, Rule 3) — safe
// because cost paths bypass this check entirely.
export async function isEnforcementEnabled(force = false): Promise<boolean> {
  if (!force && flagCache && Date.now() - flagCache.at < FLAG_TTL_MS) return flagCache.on;
  try {
    const { serverDb } = await import("@/lib/payments/serverdb");
    const db = serverDb(true);
    const { data } = await db.from("enforcement_flags").select("enabled").eq("market", "default").maybeSingle();
    const on = data?.enabled === true;
    flagCache = { at: Date.now(), on };
    return on;
  } catch (err) {
    console.error("[enforce] kill-switch read failed, defaulting OFF (fail-open):", (err as Error)?.message);
    return false;
  }
}

export function _resetEnforcementFlagCache() { flagCache = null; } // test hook

/** Gate a non-metered capability. Cost paths always enforced; others follow the kill switch. */
export async function enforce(userId: string, cap: Capability): Promise<DecideResult> {
  if (CAP_META[cap].costPath) return EntitlementService.can(userId, cap);
  if (!(await isEnforcementEnabled())) return { allowed: true, value: undefined, reason: "enforcement_off" };
  return EntitlementService.can(userId, cap);
}

/** Atomically consume a metered capability. Cost paths always enforced; others follow the kill switch. */
export async function enforceConsume(userId: string, cap: Capability, amount = 1): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
  if (CAP_META[cap].costPath) return EntitlementService.consume(userId, cap, amount);
  if (!(await isEnforcementEnabled())) return { allowed: true, remaining: Infinity, reason: "enforcement_off" };
  return EntitlementService.consume(userId, cap, amount);
}
