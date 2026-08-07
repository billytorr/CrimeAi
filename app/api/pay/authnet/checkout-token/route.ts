import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { loadTierConfig } from "@/lib/entitlements/config";
import { assignPriceArm } from "@/lib/authnet/pricing";
import { signCheckoutToken, newNonce } from "@/lib/authnet/checkout-token";

// POST /api/pay/authnet/checkout-token
// Authenticated app user → issues a short-lived signed token for the
// cross-domain checkout handoff. The token carries the user id, plan,
// assigned A/B price arm and a single-use nonce — nothing identifying in
// the URL. Server validates the caller's Supabase session (Rule 2).
export const dynamic = "force-dynamic";
const TTL_MS = 10 * 60 * 1000;

async function resolveUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.auth.getUser(jwt);
  return data.user || null;
}

export async function POST(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const cfg = await loadTierConfig();

    // The caller may name a price — that is how the monthly/annual toggle
    // works. VALIDATED against the active price list rather than trusted:
    // an unvalidated priceId would let anyone subscribe at any amount they
    // cared to send, including one cent.
    const body = await req.json().catch(() => ({}));
    const requested = body?.priceId ? cfg.prices.find((p) => p.id === body.priceId && p.active) : undefined;

    // No explicit choice → the existing A/B assignment, unchanged.
    const arm = requested || assignPriceArm(user.id, cfg.prices);

    const nonce = newNonce();
    const db = serverDb(true);
    const { error } = await db.from("checkout_nonces").insert({
      nonce, user_id: user.id, price_id: arm.id,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    });
    if (error) throw new Error(error.message);

    const token = signCheckoutToken({ userId: user.id, plan: "pro", priceId: arm.id, nonce, exp: Date.now() + TTL_MS });
    const base = process.env.NEXT_PUBLIC_PAY_BASE || "https://pay.publicsafetycrimecenter.com";
    return NextResponse.json({
      token,
      checkoutUrl: `${base}/crimeai/pricing/checkout?t=${encodeURIComponent(token)}`,
      priceId: arm.id,
      amountCents: arm.amountCents,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
