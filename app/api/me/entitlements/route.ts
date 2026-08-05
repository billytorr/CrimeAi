import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";
import { isEnforcementEnabled } from "@/lib/entitlements/enforce";
import { EntitlementService } from "@/lib/entitlements/service";
import { ALL_CAPABILITIES, CAP_META, type Capability } from "@/lib/entitlements/capabilities";

// GET /api/me/entitlements — read-only view of the caller's plan + limits +
// metered usage, for RENDERING ONLY (Rule 2: the client is never authority;
// every real gate lives server-side). Shape:
//   { plan, enforced, caps: { <cap>: { kind, value, used?, remaining?, allowed } } }
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const enforced = await isEnforcementEnabled();
  const caps: Record<string, unknown> = {};
  await Promise.all(
    (ALL_CAPABILITIES as Capability[]).map(async (cap) => {
      const r = await EntitlementService.can(userId, cap);
      caps[cap] = {
        kind: CAP_META[cap].kind,
        value: r.value ?? null,
        ...(r.used !== undefined ? { used: r.used } : {}),
        ...(r.remaining !== undefined && Number.isFinite(r.remaining) ? { remaining: r.remaining } : {}),
        allowed: r.allowed,
      };
    }),
  );

  // plan comes cheap from any decide call; recompute directly for clarity
  const { sub } = await (async () => {
    const { serverDb } = await import("@/lib/payments/serverdb");
    const db = serverDb(true);
    const { data } = await db.from("tier_subscriptions")
      .select("plan_id, status, current_period_start, grace_until, price_id")
      .eq("user_id", userId).maybeSingle();
    return { sub: data };
  })();
  const plan = EntitlementService.effectivePlan(sub ?? null);

  return NextResponse.json({ plan, enforced, caps });
}
