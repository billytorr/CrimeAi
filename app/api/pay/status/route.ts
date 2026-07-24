import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { getProvider } from "@/lib/payments/provider";

// Public: which provider is selected and is it actually ready to charge?
export async function GET() {
  try {
    const db = serverDb();
    const [{ data: conf }, { data: pro }] = await Promise.all([
      db.from("payment_config").select("provider, currency, checkout_url").eq("id", 1).maybeSingle(),
      db.from("plans").select("name, price_cents, features, tagline").eq("id", "pro").maybeSingle(),
    ]);
    const provider = conf?.provider || "none";
    const adapter = getProvider(provider);
    const cfg = { provider, currency: conf?.currency || "usd", checkout_url: conf?.checkout_url || "" };
    return NextResponse.json({
      provider,
      ready: !!adapter?.ready(cfg),
      plan: pro || null,
    });
  } catch {
    return NextResponse.json({ provider: "none", ready: false, plan: null });
  }
}
