// POST /api/pay/authnet/retoken  { token, priceId }
//
// Swap a valid checkout token for one bound to a DIFFERENT price.
//
// The pricing page runs in the device's browser with no CrimeAI session, so
// it cannot mint a checkout token itself. It arrives holding one the app
// already minted, and this exchanges it when the visitor picks a different
// plan or switches monthly/annual.
//
// SECURITY: the incoming token's signature is what authenticates this — it
// proves the app minted it for that user. The new price is validated against
// the active price list, so a caller cannot name an arbitrary amount. A fresh
// single-use nonce is issued and the OLD one is burned, so the exchange can't
// be used to mint unlimited live checkout links from one token.

import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { loadTierConfig } from "@/lib/entitlements/config";
import { signCheckoutToken, verifyCheckoutToken, newNonce } from "@/lib/authnet/checkout-token";

export const dynamic = "force-dynamic";
const TTL_MS = 30 * 60_000;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" };
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

export async function POST(req: Request) {
  try {
    const { token, priceId } = await req.json();
    const v = verifyCheckoutToken(String(token || ""));
    if (!v.valid) return NextResponse.json({ error: `Invalid checkout (${v.reason})` }, { status: 400, headers: CORS });

    const cfg = await loadTierConfig();
    const price = cfg.prices.find((p) => p.id === String(priceId || "") && p.active);
    if (!price) return NextResponse.json({ error: "That plan isn't available." }, { status: 409, headers: CORS });

    // Same price → hand back the token unchanged rather than burning a nonce.
    if (price.id === v.claims.priceId) {
      return NextResponse.json({ token, priceId: price.id, amountCents: price.amountCents }, { headers: CORS });
    }

    const db = serverDb(true);
    const nonce = newNonce();
    const { error } = await db.from("checkout_nonces").insert({
      nonce, user_id: v.claims.userId, price_id: price.id,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    });
    if (error) throw new Error(error.message);

    // Burn the old nonce so one app-minted token yields one live link at a
    // time — otherwise switching plans back and forth would leave a trail of
    // redeemable checkout links.
    await db.from("checkout_nonces").update({ used_at: new Date().toISOString() }).eq("nonce", v.claims.nonce);

    const fresh = signCheckoutToken({
      userId: v.claims.userId, plan: "pro", priceId: price.id, nonce, exp: Date.now() + TTL_MS,
    });
    return NextResponse.json({ token: fresh, priceId: price.id, amountCents: price.amountCents }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS });
  }
}
