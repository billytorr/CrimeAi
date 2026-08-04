import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { loadTierConfig } from "@/lib/entitlements/config";
import { assignPriceArm } from "@/lib/authnet/pricing";
import { signCheckoutToken, newNonce } from "@/lib/authnet/checkout-token";
import { deleteCustomerProfile } from "@/lib/authnet/customer-profile";
import { cancelSubscription } from "@/lib/authnet/arb";
import { anetEnv } from "@/lib/authnet/env";
import { emailFrom } from "@/lib/email/resend";
import { sendProtectorWelcome } from "@/lib/email/payment-emails";
import { createHmac } from "node:crypto";

// SANDBOX-ONLY verification helper. Mints a checkout token for a throwaway
// test user so the full Accept.js -> Customer Profile -> ARB round-trip can be
// driven against the real Authorize.Net SANDBOX without a logged-in session.
//
// HARD GATE: refuses unless AUTHNET_ENV === "sandbox". In production this
// route returns 404 and does nothing — it cannot mint a token or touch money.
// Safe to delete once payments are done.
export const dynamic = "force-dynamic";
const TTL_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  if (anetEnv() !== "sandbox") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const q = new URL(req.url).searchParams;

    // cleanup: ?reset=<customerProfileId> deletes a stored CIM profile
    const reset = q.get("reset");
    if (reset) {
      return NextResponse.json({ env: "sandbox", deletedProfile: reset, ok: await deleteCustomerProfile(reset) });
    }
    // cleanup: ?cancelSub=<subscriptionId> cancels an ARB subscription
    const cancel = q.get("cancelSub");
    if (cancel) {
      let ok = true, err = "";
      try { await cancelSubscription(cancel); } catch (e) { ok = false; err = (e as Error).message; }
      return NextResponse.json({ env: "sandbox", canceledSub: cancel, ok, err });
    }

    // test: email setup. ?emailStatus=1 reports whether Resend is wired;
    // ?testEmail=<addr> actually sends a sample welcome email and returns the
    // Resend result (id on success).
    if (q.has("emailStatus") || q.get("testEmail")) {
      const to = q.get("testEmail");
      const base = { env: "sandbox", hasResendKey: !!process.env.RESEND_API_KEY, from: emailFrom() };
      if (to) return NextResponse.json({ ...base, to, result: await sendProtectorWelcome(to, { amountCents: 799 }) });
      return NextResponse.json(base);
    }

    // test: run reconciliation with the server-side secret (sandbox only).
    if (q.get("reconcile")) {
      const secret = process.env.RECONCILE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const origin = new URL(req.url).origin;
      const res = await fetch(`${origin}/api/pay/authnet/reconcile?key=${encodeURIComponent(secret)}`, { cache: "no-store" });
      return NextResponse.json({ env: "sandbox", reconcileStatus: res.status, result: await res.json().catch(() => null) });
    }

    // test: fire a correctly-SIGNED synthetic webhook to prove verify+dispatch.
    // ?fireWebhook=<eventType>&sub=<subscriptionId>[&nid=<notificationId>]
    const fire = q.get("fireWebhook");
    if (fire) {
      const key = process.env.AUTHNET_SIGNATURE_KEY;
      if (!key) return NextResponse.json({ error: "AUTHNET_SIGNATURE_KEY not set in this env" }, { status: 400 });
      const subId = q.get("sub") || "";
      const nid = q.get("nid") || `test-${subId}-${fire}`;
      const evt = {
        notificationId: nid, eventType: fire, eventDate: "2026-08-04T00:00:00.0000000Z", webhookId: "selftest",
        payload: { entityName: fire.includes("payment") ? "transaction" : "subscription", id: subId, status: "test" },
      };
      const raw = JSON.stringify(evt);
      const sig = "sha512=" + createHmac("sha512", key).update(raw, "utf8").digest("hex").toUpperCase();
      const origin = new URL(req.url).origin;
      const res = await fetch(`${origin}/api/pay/authnet/webhook`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-ANET-Signature": sig }, body: raw,
      });
      return NextResponse.json({ env: "sandbox", fired: fire, sub: subId, notificationId: nid, webhookStatus: res.status, webhookBody: await res.json().catch(() => null) });
    }

    // default: mint a checkout token. ?u=<uuid> targets a specific seeded user.
    const cfg = await loadTierConfig();
    const uParam = q.get("u");
    const userId = (uParam && /^[0-9a-f-]{36}$/i.test(uParam)) ? uParam : "a0000000-0000-4000-8000-000000000001";
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
