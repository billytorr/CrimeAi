import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";

// Merchant webhooks land here. Stripe events are verified by signature;
// other providers get their own verification blocks when activated.
// On successful payment: profiles.plan → 'pro' + a payments row (the
// service-role client bypasses RLS — this is the ONLY writer of payments).
export async function POST(req: Request) {
  const provider = req.headers.get("stripe-signature") ? "stripe" : "unknown";

  if (provider === "stripe") {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const body = await req.text();
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, req.headers.get("stripe-signature")!, process.env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }

    const db = serverDb(true);

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as any;
      const userId = s.client_reference_id;
      if (userId) {
        await db.from("profiles").update({
          plan: "pro",
          pro_since: new Date().toISOString(),
          stripe_customer_id: s.customer || null,
        }).eq("id", userId);
        await db.from("payments").insert({
          user_id: userId, email: s.customer_details?.email || "",
          amount_cents: s.amount_total ?? 911, currency: s.currency || "usd",
          kind: "subscription", stripe_session: s.id, status: "paid",
        });
      }
    }

    if (event.type === "invoice.paid") {
      const inv = event.data.object as any;
      // renewals: find the user by stripe customer
      const { data: prof } = await db.from("profiles").select("id, email").eq("stripe_customer_id", inv.customer).maybeSingle();
      if (prof && inv.billing_reason === "subscription_cycle") {
        await db.from("payments").insert({
          user_id: prof.id, email: prof.email || "",
          amount_cents: inv.amount_paid, currency: inv.currency || "usd",
          kind: "renewal", stripe_invoice: inv.id, status: "paid",
        });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as any;
      await db.from("profiles").update({ plan: "free" }).eq("stripe_customer_id", sub.customer);
    }

    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
}
