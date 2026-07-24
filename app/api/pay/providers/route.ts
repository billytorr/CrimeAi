import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { listProviders } from "@/lib/payments/registry";

// Integration status board for Command Center → Finance. Reveals only
// booleans and env-var NAMES (never values) — which is back-office
// operational info, not secrets. The active merchant's identity is
// still kept off the public /api/pay/status endpoint.
// CORS: the portal lives on portal.publicsafetycrimecenter.com, a
// different origin than this API — allow cross-origin reads.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  try {
    const db = serverDb();
    const { data: conf } = await db.from("payment_config").select("provider, currency, checkout_url").eq("id", 1).maybeSingle();
    const cfg = { provider: conf?.provider || "none", currency: conf?.currency || "usd", checkout_url: conf?.checkout_url || "" };

    const providers = listProviders().map((p) => ({
      id: p.id,
      label: p.label,
      mode: p.mode,                       // "api" = fully integrated, "hosted-link" = redirect stopgap
      webhook: p.verifyWebhook ? `/api/pay/webhook/${p.id}` : null,
      requiredEnv: p.requiredEnv,
      envMissing: p.requiredEnv.filter((v) => !process.env[v]),
      ready: p.ready(cfg),
      active: p.id === cfg.provider,
    }));
    return NextResponse.json({ active: cfg.provider, providers }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS });
  }
}
