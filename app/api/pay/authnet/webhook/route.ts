import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { verifyWebhookSignature } from "@/lib/authnet/webhook-verify";
import { ANET_EVENTS, decideSubscriptionEvent, graceDaysFromEnv } from "@/lib/authnet/webhook-events";
import { getTransactionSubscription } from "@/lib/authnet/arb";
import { sendPaymentReceipt, sendPaymentFailed, sendSubscriptionCanceled } from "@/lib/email/payment-emails";

// POST /api/pay/authnet/webhook
// Authorize.Net → us. EVERY event is signature-verified against the raw body
// before we trust a byte (an unverified webhook is how anyone could grant
// themselves Protector). Processing is idempotent via claim_webhook_event, so
// Authorize.Net's retries can't double-apply. Our DB stays the source of
// truth; reconciliation is the backstop for anything a webhook misses.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function resolveEmail(db: any, sub: { receipt_email?: string | null; user_id?: string } | null): Promise<string> {
  if (!sub) return "";
  if (sub.receipt_email) return sub.receipt_email;
  if (sub.user_id) {
    const { data } = await db.from("profiles").select("email").eq("id", sub.user_id).maybeSingle();
    return data?.email || "";
  }
  return "";
}

const SUB_COLS = "user_id, receipt_email, price_id, card_brand, card_last4, grace_until";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-anet-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const notificationId: string = evt?.notificationId;
  const eventType: string = evt?.eventType || "";
  const payload = evt?.payload || {};
  if (!notificationId) return NextResponse.json({ error: "no notificationId" }, { status: 400 });

  const db = serverDb(true);
  const subHint = payload?.entityName === "subscription" ? String(payload?.id ?? "") : null;

  // idempotent claim — only the first delivery of this notificationId proceeds
  const { data: claimed, error: claimErr } = await db.rpc("claim_webhook_event", {
    p_notification_id: notificationId, p_event_type: eventType, p_subscription_id: subHint, p_payload: evt,
  });
  if (claimErr) return NextResponse.json({ error: "claim failed" }, { status: 500 }); // let AuthNet retry
  if (claimed !== true) return NextResponse.json({ ok: true, duplicate: true }); // already handled

  try {
    await handle(db, eventType, payload);
    await db.from("payment_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("notification_id", notificationId);
  } catch (e) {
    // Don't storm retries — record the error and let reconciliation self-heal.
    await db.from("payment_webhook_events").update({ status: "error", error: (e as Error).message }).eq("notification_id", notificationId);
  }
  return NextResponse.json({ ok: true });
}

async function handle(db: any, eventType: string, payload: any) {
  // Recurring-charge success: link the transaction back to its subscription,
  // advance the period, clear any dunning, and receipt the customer.
  if (eventType === ANET_EVENTS.AUTHCAPTURE) {
    const transId = String(payload?.id ?? "");
    if (!transId) return;
    const info = await getTransactionSubscription(transId);
    if (!info?.subscriptionId) return; // not a subscription charge — ignore
    const start = info.submitTimeUTC ? new Date(info.submitTimeUTC) : new Date();
    const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
    const { data: sub } = await db.from("tier_subscriptions").update({
      status: "active", grace_until: null,
      current_period_start: start.toISOString(), current_period_end: end.toISOString(),
      card_brand: info.cardBrand || undefined, card_last4: info.last4 || undefined,
      updated_at: new Date().toISOString(),
    }).eq("anet_subscription_id", info.subscriptionId).select(SUB_COLS + ", user_id").maybeSingle();
    if (sub) {
      const to = await resolveEmail(db, sub);
      if (to) await sendPaymentReceipt(to, { amountCents: info.amountCents, dateISO: start.toISOString(), cardBrand: info.cardBrand, last4: info.last4 });
    }
    return;
  }

  // Subscription lifecycle: suspend (dunning) / cancel / expire.
  const decision = decideSubscriptionEvent(eventType, Date.now(), graceDaysFromEnv());
  if (decision.action === "noop") return;
  const subId = String(payload?.id ?? "");
  if (!subId) return;

  const { data: sub } = await db.from("tier_subscriptions").update({
    ...decision.update, updated_at: new Date().toISOString(),
  }).eq("anet_subscription_id", subId).select(SUB_COLS).maybeSingle();
  if (!sub || !decision.email) return;

  const to = await resolveEmail(db, sub);
  if (!to) return;
  if (decision.email === "payment_failed") await sendPaymentFailed(to, { graceUntilISO: (decision.update.grace_until as string) ?? null });
  else if (decision.email === "canceled") await sendSubscriptionCanceled(to);
}
