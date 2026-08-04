// Server-side request helpers for enforcement: resolve the calling user from
// the Bearer JWT, and turn plan limits into route-applicable clamps.
// NEVER imported by safety paths (Rule 1).
import type { Capability } from "./capabilities";
import { isEnforcementEnabled } from "./enforce";
import { EntitlementService } from "./service";
import { loadTierConfig, planValue } from "./config";
import type { AreaStats } from "@/lib/types";

// Bearer JWT -> Supabase user id (null when absent/invalid). Same pattern as
// the checkout-token route; the client attaches its session token.
export async function resolveUserId(req: Request): Promise<string | null> {
  try {
    const auth = req.headers.get("authorization") || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!jwt) return null;
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data } = await sb.auth.getUser(jwt);
    return data.user?.id ?? null;
  } catch {
    return null; // fail-open: treated as anonymous, free-tier clamps apply
  }
}

// The plan value to APPLY for a non-cost capability, or null = don't clamp
// (kill switch off, or config unavailable → fail-open). Anonymous callers
// get the free plan's value.
export async function planLimitFor(userId: string | null, cap: Capability): Promise<unknown | null> {
  try {
    if (!(await isEnforcementEnabled())) return null;
    if (userId) {
      const r = await EntitlementService.can(userId, cap);
      return r.value ?? null;
    }
    const cfg = await loadTierConfig();
    return planValue(cfg, "free", cap) ?? null;
  } catch (err) {
    console.error(`[entitlements] planLimitFor(${cap}) failed, fail-open:`, (err as Error)?.message);
    return null;
  }
}

// Clamp a requested lookback window to the plan's map-history allowance.
export function clampDays(requested: number, maxDays: unknown | null): number {
  const req = Number.isFinite(requested) && requested > 0 ? requested : 30;
  if (maxDays == null) return req;
  const m = Number(maxDays);
  return Number.isFinite(m) && m > 0 ? Math.min(req, m) : req;
}

// Trim area stats to the plan's Safety Score depth. "full" (Protector) keeps
// everything; anything else strips the deep analytics (time-of-day histogram,
// full type/source breakdown, city comparison) while keeping the score itself
// — free users always get the current score, never nothing.
export function trimStatsForDepth<T extends AreaStats>(stats: T, depth: unknown | null): T & { statsDepth: "current" | "full" } {
  if (depth == null || depth === "full") return { ...stats, statsDepth: "full" };
  return {
    ...stats,
    byType: stats.byType.slice(0, 3),
    bySource: [],
    hourHistogram: [],
    nightSharePct: 0,
    cityComparisonPct: 0,
    statsDepth: "current",
  };
}
