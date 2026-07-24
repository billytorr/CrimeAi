import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { getProvider } from "@/lib/payments/registry";

// Subscription self-service: returns the merchant's billing portal URL
// (update card, cancel) for a Protector member. Providers that haven't
// implemented manageUrl return 501 and the app shows a support message.
export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 400 });

    const db = serverDb(true);
    const { data: sub } = await db.from("subscriptions")
      .select("provider, provider_customer_id")
      .eq("user_id", userId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    // fall back to the legacy Stripe column for early subscribers
    let provider = sub?.provider;
    let customerId = sub?.provider_customer_id;
    if (!customerId) {
      const { data: prof } = await db.from("profiles").select("stripe_customer_id").eq("id", userId).maybeSingle();
      if (prof?.stripe_customer_id) { provider = "stripe"; customerId = prof.stripe_customer_id; }
    }
    if (!provider || !customerId) return NextResponse.json({ error: "No active subscription found" }, { status: 404 });

    const adapter = getProvider(provider);
    if (!adapter?.manageUrl) {
      return NextResponse.json({ error: "Contact support to manage your subscription." }, { status: 501 });
    }
    const base = process.env.NEXT_PUBLIC_PAY_BASE || "https://pay.publicsafetycrimecenter.com";
    const { url } = await adapter.manageUrl(customerId, `${base}/crimeai/checkout?uid=${userId}`);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
