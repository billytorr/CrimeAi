import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { getSubscriptionStatus } from "@/lib/authnet/arb";
import { graceDaysFromEnv, graceUntil } from "@/lib/authnet/webhook-events";
import { sendSubscriptionCanceled } from "@/lib/email/payment-emails";

// GET /api/pay/authnet/reconcile
// Backstop for webhooks: pulls the authoritative subscription status from
// Authorize.Net for every live subscription and corrects drift in OUR DB, and
// sweeps past_due subscriptions whose grace window has ended to 'canceled'
// (Rule 7 — revoke only AFTER grace). Meant to run on a schedule (Vercel Cron)
// AND to be safely runnable by hand.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const key = new URL(req.url).searchParams.get("key") || "";
  // Vercel Cron injects Authorization: Bearer <CRON_SECRET>.
  if (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) return true;
  const manual = process.env.RECONCILE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!manual && (key === manual || bearer === manual);
}

// Authorize.Net ARB status → our status.
function mapArbStatus(arb: string, current: string, graceDays: number): { status?: string; grace_until?: string | null } | null {
  switch ((arb || "").toLowerCase()) {
    case "active":
      // payment recovered / healthy → active; clear any dunning window
      return current === "active" ? null : { status: "active", grace_until: null };
    case "suspended":
      // enter/keep dunning; only set grace if we don't already have one
      return current === "past_due" ? null : { status: "past_due", grace_until: graceUntil(Date.now(), graceDays) };
    case "canceled":
    case "terminated":
      return current === "canceled" ? null : { status: "canceled", grace_until: null };
    case "expired":
      return current === "expired" ? null : { status: "expired", grace_until: null };
    default:
      return null;
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = serverDb(true);
  const graceDays = graceDaysFromEnv();
  const now = Date.now();
  const summary = { checked: 0, drift_corrected: 0, grace_swept: 0, errors: 0 };

  const { data: subs, error } = await db
    .from("tier_subscriptions")
    .select("user_id, receipt_email, status, grace_until, anet_subscription_id")
    .in("status", ["active", "grace", "past_due"])
    .not("anet_subscription_id", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const sub of subs || []) {
    summary.checked++;

    // 1) grace sweep: dunning window elapsed → revoke to free (canceled)
    if (sub.status === "past_due" && sub.grace_until && now >= +new Date(sub.grace_until)) {
      await db.from("tier_subscriptions").update({ status: "canceled", grace_until: null, updated_at: new Date().toISOString() }).eq("user_id", sub.user_id);
      summary.grace_swept++;
      const to = sub.receipt_email || (await db.from("profiles").select("email").eq("id", sub.user_id).maybeSingle()).data?.email;
      if (to) { try { await sendSubscriptionCanceled(to); } catch { /* non-fatal */ } }
      continue;
    }

    // 2) drift: correct our status against Authorize.Net's truth
    try {
      const arb = await getSubscriptionStatus(sub.anet_subscription_id as string);
      const change = mapArbStatus(arb, sub.status, graceDays);
      if (change) {
        await db.from("tier_subscriptions").update({ ...change, updated_at: new Date().toISOString() }).eq("user_id", sub.user_id);
        summary.drift_corrected++;
      }
    } catch {
      summary.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
