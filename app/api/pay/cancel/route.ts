import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";

// POST /api/pay/cancel — native in-app cancellation (App Store remediation
// Phase 4.5). Calls the Authorize.Net ARB cancel directly; the user is NOT
// sent to a web page. Cancellation is end-of-period: ARB stops future
// charges, the user keeps Protector until current_period_end, and the
// webhook/reconcile pipeline settles the final status transition.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALREADY_DONE = /already|E00105|terminated|canceled|cancelled|expired/i;

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Sign in." }, { status: 401 });

  try {
    const { serverDb } = await import("@/lib/payments/serverdb");
    const db = serverDb(true);
    const { data: sub } = await db.from("tier_subscriptions")
      .select("anet_subscription_id, status, current_period_end, cancel_at_period_end")
      .eq("user_id", userId).maybeSingle();

    if (!sub?.anet_subscription_id) {
      return NextResponse.json({ error: "No active subscription found for this account." }, { status: 404 });
    }
    if (sub.cancel_at_period_end) {
      return NextResponse.json({ cancelled: true, accessUntil: sub.current_period_end }); // idempotent
    }

    try {
      const { cancelSubscription } = await import("@/lib/authnet/arb");
      await cancelSubscription(sub.anet_subscription_id);
    } catch (e) {
      if (!ALREADY_DONE.test((e as Error).message || "")) {
        return NextResponse.json({ error: "We couldn't cancel with the payment provider — please try again, or email support@publicsafetycrimecenter.com." }, { status: 502 });
      }
    }

    await db.from("tier_subscriptions")
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    return NextResponse.json({ cancelled: true, accessUntil: sub.current_period_end });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
