// EntitlementService — the SINGLE surface every gate in the app calls.
// No tier logic anywhere else (Rule 1: and NEVER in a safety path).
//
//   can(userId, capability)               → read-only entitlement check
//   consume(userId, meteredCapability, n) → atomic metered decrement
//
// Failure policy (Rule 3):
//   • Infra error (DB down, config unreachable) → FAIL OPEN: grant access
//     and log loudly. A billing/DB outage must never suppress a feature.
//   • EXCEPT capabilities flagged costPath (SMS, expensive AI): those FAIL
//     CLOSED to free-tier behavior — never to nothing, never to unbounded
//     spend.
// serverDb imported lazily inside DB helpers (keeps effectivePlan /
// periodStart pure-testable without the supabase chain).
import { CAP_META, type Capability } from "./capabilities";
import { loadTierConfig, planValue } from "./config";
import { decide, type DecideResult } from "./decide";

interface SubRow {
  plan_id: string;
  status: string;
  current_period_start: string | null;
  grace_until: string | null;
  price_id: string | null;
}

// grace keeps access (Rule 7): active + grace + (past_due within grace) → paid.
export function effectivePlan(sub: SubRow | null, now: number = Date.now()): string {
  if (!sub) return "free";
  if (sub.status === "active" || sub.status === "grace") return sub.plan_id;
  if (sub.status === "past_due" && sub.grace_until && now < +new Date(sub.grace_until)) return sub.plan_id;
  return "free";
}

// Metered counters reset on the billing-period boundary. Free users have no
// billing period, so anchor to their account creation date (Rule 5).
export function periodStart(sub: SubRow | null, accountCreatedAt: Date, now: Date = new Date()): Date {
  if (sub && (sub.status === "active" || sub.status === "grace") && sub.current_period_start) {
    return new Date(sub.current_period_start);
  }
  // Free tier: anchor to the account-creation date, stepping monthly.
  // All UTC so the boundary is identical regardless of server timezone.
  const d = accountCreatedAt;
  const anchorDay = d.getUTCDate();
  let months = (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + (now.getUTCMonth() - d.getUTCMonth());
  if (now.getUTCDate() < anchorDay) months -= 1;
  months = Math.max(0, months);
  return new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth() + months, anchorDay,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
  ));
}

function logIncident(where: string, err: unknown) {
  // loud, structured — Rule 3 requires visibility, not silence
  console.error(`[entitlements] FAIL-OPEN at ${where}:`, (err as Error)?.message || err);
}

async function loadUserState(userId: string): Promise<{ sub: SubRow | null; anchor: Date }> {
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);
  const [{ data: sub }, { data: prof }] = await Promise.all([
    db.from("tier_subscriptions").select("plan_id, status, current_period_start, grace_until, price_id").eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
  ]);
  const anchor = prof?.created_at ? new Date(prof.created_at) : new Date();
  return { sub: (sub as SubRow) || null, anchor };
}

export const EntitlementService = {
  effectivePlan,
  periodStart,

  /** Read-only check. Fail-open on infra error (fail-closed for cost paths). */
  async can(userId: string, cap: Capability): Promise<DecideResult> {
    const meta = CAP_META[cap];
    try {
      const [cfg, { sub, anchor }] = await Promise.all([loadTierConfig(), loadUserState(userId)]);
      const plan = effectivePlan(sub);
      const value = planValue(cfg, plan, cap);

      let used = 0;
      if (meta.kind === "metered") {
        const ps = periodStart(sub, anchor).toISOString();
        const { serverDb } = await import("@/lib/payments/serverdb");
        const db = serverDb(true);
        const { data } = await db.from("usage_counters").select("count")
          .eq("user_id", userId).eq("capability", cap).eq("period_start", ps).maybeSingle();
        used = data?.count ?? 0;
      }
      return decide(cap, value, used);
    } catch (err) {
      logIncident(`can(${cap})`, err);
      if (meta.costPath) {
        // fail closed to FREE behavior — never to nothing, never to unbounded
        return { allowed: false, value: undefined, reason: "fail_closed_infra" };
      }
      return { allowed: true, value: undefined, reason: "fail_open_infra" };
    }
  },

  /**
   * Atomically consume `amount` of a metered capability for the current
   * billing period. The whole check-and-increment happens in one SQL
   * statement (consume_usage), so concurrent callers cannot both exceed
   * the limit (Rule 5).
   */
  async consume(userId: string, cap: Capability, amount = 1): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
    const meta = CAP_META[cap];
    if (meta.kind !== "metered") {
      throw new Error(`consume() called on non-metered capability '${cap}'`);
    }
    try {
      const [cfg, { sub, anchor }] = await Promise.all([loadTierConfig(), loadUserState(userId)]);
      const plan = effectivePlan(sub);
      const value = planValue(cfg, plan, cap);
      const limit = typeof value === "number" ? value : -1;
      const ps = periodStart(sub, anchor).toISOString();

      const { serverDb } = await import("@/lib/payments/serverdb");
      const db = serverDb(true);
      const { data, error } = await db.rpc("consume_usage", {
        p_user: userId, p_capability: cap, p_period_start: ps, p_amount: amount, p_limit: limit,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const newCount = row?.new_count ?? 0;
      const remaining = limit < 0 ? Infinity : Math.max(0, limit - newCount);
      return { allowed: !!row?.allowed, remaining };
    } catch (err) {
      logIncident(`consume(${cap})`, err);
      // cost paths fail CLOSED (no free spend); others fail OPEN
      if (meta.costPath) return { allowed: false, remaining: 0, reason: "fail_closed_infra" };
      return { allowed: true, remaining: Infinity, reason: "fail_open_infra" };
    }
  },
};
