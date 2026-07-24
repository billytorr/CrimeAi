import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { getProvider } from "@/lib/payments/provider";

// Creates a hosted checkout with whichever merchant is active.
export async function POST(req: Request) {
  try {
    const { userId, email } = await req.json();
    if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 400 });

    const db = serverDb();
    const [{ data: conf }, { data: plan }] = await Promise.all([
      db.from("payment_config").select("provider, currency, checkout_url").eq("id", 1).maybeSingle(),
      db.from("plans").select("name, price_cents").eq("id", "pro").maybeSingle(),
    ]);
    const cfg = { provider: conf?.provider || "none", currency: conf?.currency || "usd", checkout_url: conf?.checkout_url || "" };
    const adapter = getProvider(cfg.provider);
    if (!adapter || !adapter.ready(cfg)) {
      return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
    }

    const base = process.env.NEXT_PUBLIC_PAY_BASE || "https://pay.publicsafetycrimecenter.com";
    const { url } = await adapter.createCheckout({
      userId,
      email: email || "",
      priceCents: plan?.price_cents ?? 911,
      planName: plan?.name || "Protector Plan",
      successUrl: `${base}/crimeai/checkout?done=1`,
      cancelUrl: `${base}/crimeai/checkout?uid=${userId}&canceled=1`,
    }, cfg);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
