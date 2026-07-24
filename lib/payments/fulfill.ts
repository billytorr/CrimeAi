// ════════════════════════════════════════════════════════════════════
// Fulfillment engine — the ONLY code that grants/revokes Protector.
//
// Every merchant's webhook funnels through applyPaymentEvents(), so the
// business rules live in exactly one place:
//
//   subscription_started  → profiles.plan='pro' + subscriptions upsert + payment row
//   payment_succeeded     → payment row (renewal) + period-end sync
//   subscription_updated  → subscriptions status/period sync
//   subscription_canceled → profiles.plan='free' + subscriptions.status='canceled'
//   payment_refunded      → refund payment row (revenue reporting)
//
// Writes use the service-role client (bypasses RLS) — webhooks are the
// single writer of payments/subscriptions. Idempotent by externalId:
// providers retry webhooks, we must not double-record.
// ════════════════════════════════════════════════════════════════════
import { serverDb } from "./serverdb";
import type { NormalizedPaymentEvent } from "./types";

type Db = ReturnType<typeof serverDb>;

/** Find our user for an event: explicit userId beats provider customer lookup. */
async function resolveUser(db: Db, ev: NormalizedPaymentEvent): Promise<{ id: string; email: string } | null> {
  if (ev.userId) {
    const { data } = await db.from("profiles").select("id, email").eq("id", ev.userId).maybeSingle();
    if (data) return { id: data.id, email: data.email || ev.email || "" };
  }
  if (ev.subscriptionId) {
    const { data } = await db.from("subscriptions").select("user_id").eq("provider_subscription_id", ev.subscriptionId).maybeSingle();
    if (data?.user_id) {
      const { data: p } = await db.from("profiles").select("id, email").eq("id", data.user_id).maybeSingle();
      if (p) return { id: p.id, email: p.email || ev.email || "" };
    }
  }
  if (ev.customerId) {
    const { data } = await db.from("subscriptions").select("user_id").eq("provider", ev.provider).eq("provider_customer_id", ev.customerId).maybeSingle();
    if (data?.user_id) {
      const { data: p } = await db.from("profiles").select("id, email").eq("id", data.user_id).maybeSingle();
      if (p) return { id: p.id, email: p.email || ev.email || "" };
    }
    // legacy column kept for Stripe rows written before the subscriptions table existed
    const { data: legacy } = await db.from("profiles").select("id, email").eq("stripe_customer_id", ev.customerId).maybeSingle();
    if (legacy) return { id: legacy.id, email: legacy.email || ev.email || "" };
  }
  return null;
}

async function recordPayment(db: Db, ev: NormalizedPaymentEvent, userId: string, email: string, kind: string, status: string) {
  if (ev.externalId) {
    const { data: dup } = await db.from("payments").select("id").eq("external_id", ev.externalId).eq("kind", kind).maybeSingle();
    if (dup) return; // webhook retry — already recorded
  }
  await db.from("payments").insert({
    user_id: userId,
    email,
    amount_cents: ev.amountCents ?? 0,
    currency: ev.currency || "usd",
    kind,
    status,
    provider: ev.provider,
    external_id: ev.externalId || null,
  });
}

async function upsertSubscription(db: Db, ev: NormalizedPaymentEvent, userId: string, status: string) {
  const row = {
    user_id: userId,
    provider: ev.provider,
    provider_customer_id: ev.customerId || null,
    provider_subscription_id: ev.subscriptionId || null,
    status,
    price_cents: ev.amountCents ?? null,
    current_period_end: ev.periodEnd || null,
    updated_at: new Date().toISOString(),
  };
  if (ev.subscriptionId) {
    const { data } = await db.from("subscriptions").select("id").eq("provider_subscription_id", ev.subscriptionId).maybeSingle();
    if (data) { await db.from("subscriptions").update(row).eq("id", data.id); return; }
  }
  await db.from("subscriptions").insert(row);
}

export async function applyPaymentEvents(events: NormalizedPaymentEvent[]) {
  if (!events.length) return;
  const db = serverDb(true);

  for (const ev of events) {
    const user = await resolveUser(db, ev);
    if (!user) continue; // event for someone we can't match — skip, provider dashboard has the record

    switch (ev.type) {
      case "subscription_started": {
        await db.from("profiles").update({
          plan: "pro",
          pro_since: new Date().toISOString(),
          ...(ev.provider === "stripe" && ev.customerId ? { stripe_customer_id: ev.customerId } : {}),
        }).eq("id", user.id);
        await upsertSubscription(db, ev, user.id, "active");
        await recordPayment(db, ev, user.id, user.email, "subscription", "paid");
        break;
      }
      case "payment_succeeded": {
        await recordPayment(db, ev, user.id, user.email, "renewal", "paid");
        if (ev.periodEnd || ev.subscriptionId) await upsertSubscription(db, ev, user.id, "active");
        break;
      }
      case "subscription_updated": {
        await upsertSubscription(db, ev, user.id, "active");
        break;
      }
      case "subscription_canceled": {
        await db.from("profiles").update({ plan: "free" }).eq("id", user.id);
        if (ev.subscriptionId) {
          await db.from("subscriptions").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("provider_subscription_id", ev.subscriptionId);
        } else if (ev.customerId) {
          await db.from("subscriptions").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("provider", ev.provider).eq("provider_customer_id", ev.customerId);
        }
        break;
      }
      case "payment_refunded": {
        await recordPayment(db, ev, user.id, user.email, "refund", "refunded");
        break;
      }
    }
  }
}
