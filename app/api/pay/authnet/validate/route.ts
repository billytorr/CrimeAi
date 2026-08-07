import { NextResponse } from "next/server";
import { verifyCheckoutToken } from "@/lib/authnet/checkout-token";
import { loadTierConfig } from "@/lib/entitlements/config";
import { anetPublic, statementDescriptor } from "@/lib/authnet/env";
import { billingPeriod } from "@/lib/pricing";

// GET /api/pay/authnet/validate?t=<token>
// The checkout server validates the signed token BEFORE rendering anything
// (no unsigned/tampered token gets a payment form). Returns the price to
// show and the PUBLIC Accept.js config only — never a secret.
export const dynamic = "force-dynamic";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" };
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const v = verifyCheckoutToken(t);
  if (!v.valid) return NextResponse.json({ valid: false, reason: v.reason }, { status: 200, headers: CORS });

  let amountCents = 0;
  // The checkout page has to state the REAL billing period. Without this it
  // fell back to "/mo" and an annual plan advertised itself as $69.99 a month
  // on the very screen where the customer authorises the charge — the kind of
  // misstatement that loses a chargeback dispute.
  let interval: "month" | "year" = "month";
  try {
    const cfg = await loadTierConfig();
    const price = cfg.prices.find((p) => p.id === v.claims.priceId);
    amountCents = price?.amountCents ?? 0;
    interval = billingPeriod(price);
  } catch { /* fall through with defaults */ }

  const pub = anetPublic();
  return NextResponse.json({
    valid: true,
    plan: v.claims.plan,
    priceId: v.claims.priceId,
    amountCents,
    interval,
    descriptor: statementDescriptor(),
    accept: { env: pub.env, apiLoginId: pub.apiLoginId, clientKey: pub.clientKey, acceptJsUrl: pub.acceptJsUrl },
  }, { headers: CORS });
}
