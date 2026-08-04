import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { loadTierConfig } from "@/lib/entitlements/config";
import { verifyCheckoutToken } from "@/lib/authnet/checkout-token";
import { createCustomerProfileFromOpaque } from "@/lib/authnet/customer-profile";
import { createMonthlySubscription } from "@/lib/authnet/arb";

// POST /api/pay/authnet/subscribe  { token, opaque, email }
// Runs on the checkout (pay) domain. Verifies the signed token, redeems its
// single-use nonce, tokenizes the card via the stored Customer Profile
// (card data never reaches us), creates the ARB subscription, and records
// it in OUR database (the source of truth). Settlement is confirmed later
// by webhook + reconciliation — this route never treats its own success as
// final proof of payment.
export const dynamic = "force-dynamic";
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

    // 1) store the card off-site as a Customer Profile (masked last4 only)
    const card = await createCustomerProfileFromOpaque(v.claims.userId, String(email || ""), opaque);
    // 2) create the recurring subscription
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    const sub = await createMonthlySubscription({
      amountCents: price.amountCents,
      customerProfileId: card.customerProfileId,
      customerPaymentProfileId: card.customerPaymentProfileId,
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
    });

    // 3) record in OUR db (source of truth). Webhook/reconciliation confirm
    //    settlement and keep status honest going forward.
    const now = new Date();
    const periodEnd = new Date(now); periodEnd.setMonth(periodEnd.getMonth() + 1);
    const { error } = await db.from("tier_subscriptions").upsert({
      user_id: v.claims.userId,
      plan_id: "pro",
      price_id: price.id,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      grace_until: null,
      anet_subscription_id: sub.subscriptionId,
      anet_customer_profile_id: card.customerProfileId,
      card_last4: card.last4 || null,
      card_brand: card.brand || null,
      updated_at: now.toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    const appBase = process.env.NEXT_PUBLIC_APP_BASE || "https://app.publicsafetycrimecenter.com";
    return NextResponse.json({ ok: true, returnTo: `${appBase}/?upgraded=1` }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS });
  }
}
