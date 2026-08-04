import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { loadTierConfig } from "@/lib/entitlements/config";
import { assignPriceArm } from "@/lib/authnet/pricing";
import { signCheckoutToken, newNonce } from "@/lib/authnet/checkout-token";
import { deleteCustomerProfile } from "@/lib/authnet/customer-profile";
import { cancelSubscription, getSubscriptionStatus } from "@/lib/authnet/arb";
import { anetPost } from "@/lib/authnet/client";
import { anetEnv } from "@/lib/authnet/env";

// SANDBOX-ONLY verification helper. Mints a checkout token for a throwaway
// test user so the full Accept.js -> Customer Profile -> ARB round-trip can be
// driven against the real Authorize.Net SANDBOX without a logged-in session.
//
// HARD GATE: refuses unless AUTHNET_ENV === "sandbox". In production this
// route returns 404 and does nothing — it cannot mint a token or touch money.
// It only ever creates sandbox test rows. Safe to delete after verification.
export const dynamic = "force-dynamic";
const TTL_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  if (anetEnv() !== "sandbox") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const q = new URL(req.url).searchParams;
    // sandbox cleanup: ?reset=<customerProfileId> deletes a stored CIM profile
    const reset = q.get("reset");
    if (reset) {
      const ok = await deleteCustomerProfile(reset);
      return NextResponse.json({ env: "sandbox", deletedProfile: reset, ok });
    }
    // sandbox cleanup: ?cancelSub=<subscriptionId> cancels an ARB subscription
    const cancel = q.get("cancelSub");
    if (cancel) {
      let ok = true, err = "";
      try { await cancelSubscription(cancel); } catch (e) { ok = false; err = (e as Error).message; }
      return NextResponse.json({ env: "sandbox", canceledSub: cancel, ok, err });
    }
    // diagnostic: ?txns=<customerProfileId> lists that profile's transactions
    // (amount + type + status) so we can see exactly what charged and why.
    const txns = q.get("txns");
    if (txns) {
      const res = await anetPost("getTransactionListForCustomerRequest", { customerProfileId: txns });
      const t = res.raw?.transactions?.transaction;
      const list = (Array.isArray(t) ? t : t ? [t] : []).map((x: any) => ({
        transId: x.transId, amount: x.amount, status: x.transactionStatus,
        submitTimeUTC: x.submitTimeUTC, hasReturnedItems: x.hasReturnedItems,
        subscriptionId: x.subscription?.id, payNum: x.subscription?.payNum,
      }));
      return NextResponse.json({ env: "sandbox", profile: txns, count: list.length, transactions: list, resultCode: res.resultCode, message: res.text });
    }
    // diagnostic: ?subStatus=<subscriptionId> reports the ARB subscription status
    const subStatus = q.get("subStatus");
    if (subStatus) {
      const status = await getSubscriptionStatus(subStatus);
      return NextResponse.json({ env: "sandbox", subscriptionId: subStatus, status });
    }

    const cfg = await loadTierConfig();
    // Reuse a seeded demo persona (real auth.users row → satisfies the FK).
    // Disposable: its tier_subscriptions + nonce rows can be wiped after the
    // sandbox verification without touching any real customer.
    const userId = "a0000000-0000-4000-8000-000000000001";
    const arm = assignPriceArm(userId, cfg.prices);
    const nonce = newNonce();

    const db = serverDb(true);
    const { error } = await db.from("checkout_nonces").insert({
      nonce, user_id: userId, price_id: arm.id,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    });
    if (error) throw new Error(error.message);

    const token = signCheckoutToken({ userId, plan: "pro", priceId: arm.id, nonce, exp: Date.now() + TTL_MS });
    const base = process.env.NEXT_PUBLIC_PAY_BASE || "https://pay.publicsafetycrimecenter.com";
    return NextResponse.json({
      env: "sandbox",
      build: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
      userId,
      priceId: arm.id,
      amountCents: arm.amountCents,
      checkoutUrl: `${base}/crimeai/pricing/checkout?t=${encodeURIComponent(token)}`,
      note: "Sandbox test card 4111111111111111, any future expiry, any CVV.",
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
