import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { loadTierConfig } from "@/lib/entitlements/config";
import { verifyCheckoutToken } from "@/lib/authnet/checkout-token";
import { createCustomerProfileFromOpaque } from "@/lib/authnet/customer-profile";
import { createMonthlySubscription, chargeStoredProfile, nextPeriodISO } from "@/lib/authnet/arb";
import { statementDescriptor } from "@/lib/authnet/env";
import { sendProtectorWelcome } from "@/lib/email/payment-emails";

// POST /api/pay/authnet/subscribe  { token, opaque, email, name }
// Runs on the checkout (pay) domain. Verifies the signed token, redeems its
// single-use nonce, stores the card as a Customer Profile from the Accept.js
// opaque nonce (card data never reaches us — SAQ A), then creates the recurring
// ARB subscription against that profile, and records it in OUR database (the
// source of truth). Settlement is confirmed later by webhook + reconciliation —
// this route never treats its own success as final proof of payment.
//
// NOTE (Authorize.Net): an Accept.js opaque nonce CANNOT fund ARB directly
// (E00114 "Invalid OTS Token") — it must first become a Customer Profile. A
// freshly created profile can lag before ARB can charge it (E00040); handled by
// the retry in createMonthlySubscription. This lag is a sandbox-testMode
// artifact expected to be absent under production liveMode.
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" };
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

export async function POST(req: Request) {
  try {
    const { token, opaque, email, name } = await req.json();
    const v = verifyCheckoutToken(String(token || ""));
    if (!v.valid) return NextResponse.json({ error: `Invalid checkout (${v.reason})` }, { status: 400, headers: CORS });
    if (!opaque?.dataDescriptor || !opaque?.dataValue) {
      return NextResponse.json({ error: "Missing payment token" }, { status: 400, headers: CORS });
    }

    const db = serverDb(true);
    // single-use: the nonce can only be redeemed once, ever (replay-proof)
    const { data: redeemed } = await db.rpc("redeem_nonce", { p_nonce: v.claims.nonce });
    if (redeemed !== true) {
      return NextResponse.json({ error: "This checkout link was already used or expired." }, { status: 409, headers: CORS });
    }

    const cfg = await loadTierConfig();
    const price = cfg.prices.find((p) => p.id === v.claims.priceId && p.active);
    if (!price) return NextResponse.json({ error: "Price no longer available" }, { status: 409, headers: CORS });

    const interval: "month" | "year" = price.interval === "year" ? "year" : "month";
    let card, sub, charge;
    try {
      // 1) store the card off-site as a Customer Profile (masked last4 only).
      //    The billing name is stored on the payment profile so ARB can charge it.
      card = await createCustomerProfileFromOpaque(v.claims.userId, String(email || ""), opaque, String(name || ""));

      // 2) CHARGE THE FIRST PERIOD NOW.
      //    ARB does not bill when a subscription is created — even with
      //    startDate = today it waits for Authorize.Net's next daily batch.
      //    We were flipping the user to `active` at this point regardless, so
      //    subscribers got Protector without any money moving. Charging here
      //    means the subscription is only recorded if payment actually
      //    succeeded; a decline throws and nothing is written.
      charge = await chargeStoredProfile({
        amountCents: price.amountCents,
        customerProfileId: card.customerProfileId,
        customerPaymentProfileId: card.customerPaymentProfileId,
        description: `${statementDescriptor()} ${interval === "year" ? "annual" : "monthly"}`,
      });

    } catch (gatewayErr) {
      // Nothing was charged, so nothing can be replayed — un-redeem the nonce
      // so the SAME checkout link can simply be retried (otherwise a transient
      // gateway failure burns the link and strands the customer).
      await db.from("checkout_nonces").update({ used_at: null }).eq("nonce", v.claims.nonce);
      return NextResponse.json({ error: (gatewayErr as Error).message, retryable: true }, { status: 502, headers: CORS });
    }

    // 3) Set up recurring billing from the NEXT period — the one just paid for
    //    is covered, so starting today would double-charge.
    //
    //    ⚠️ SEPARATE try: the money is already taken. If ARB fails here we must
    //    NOT tell the customer to retry — that would charge them twice. Record
    //    the paid period, leave anet_subscription_id null, and let
    //    reconciliation/admin attach recurring billing later. Losing recurring
    //    setup costs us one renewal; double-charging costs a customer.
    try {
      sub = await createMonthlySubscription({
        amountCents: price.amountCents,
        customerProfileId: card.customerProfileId,
        customerPaymentProfileId: card.customerPaymentProfileId,
        interval,
        startDate: nextPeriodISO(interval),
      });
    } catch (arbErr) {
      console.error("[subscribe] CHARGED but ARB setup failed — needs manual attach.",
        { userId: v.claims.userId, transactionId: charge.transactionId, error: (arbErr as Error).message });
    }

    // 4) record in OUR db (source of truth). Webhook/reconciliation confirm
    //    settlement and keep status honest going forward.
    const now = new Date();
    const periodEnd = new Date(now);
    if (interval === "year") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);
    const { error } = await db.from("tier_subscriptions").upsert({
      user_id: v.claims.userId,
      plan_id: "pro",
      price_id: price.id,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      grace_until: null,
      anet_subscription_id: sub?.subscriptionId ?? null,
      anet_customer_profile_id: card.customerProfileId,
      card_last4: card.last4 || null,
      card_brand: card.brand || null,
      receipt_email: String(email || "") || null,
      updated_at: now.toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    // Welcome email (dormant-safe: no-ops until RESEND_API_KEY is set). Never
    // let email failure break checkout.
    if (email) { try { await sendProtectorWelcome(String(email), { amountCents: price.amountCents }); } catch { /* non-fatal */ } }

    const appBase = process.env.NEXT_PUBLIC_APP_BASE || "https://app.publicsafetycrimecenter.com";
    return NextResponse.json({ ok: true, returnTo: `${appBase}/?upgraded=1` }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS });
  }
}
