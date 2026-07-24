// Shared webhook handler: authenticate via the provider's adapter, then
// apply the normalized events through the fulfillment engine. Used by
// /api/pay/webhook/[provider] (canonical) and /api/pay/webhook (legacy
// Stripe endpoint kept so existing dashboard config keeps working).
import { NextResponse } from "next/server";
import { getProvider } from "./registry";
import { WebhookVerificationError } from "./types";
import { applyPaymentEvents } from "./fulfill";

export async function handleWebhook(providerId: string, req: Request) {
  const adapter = getProvider(providerId);
  if (!adapter) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  if (!adapter.verifyWebhook) {
    return NextResponse.json({ error: `${adapter.label} has no webhook integration yet — see PAYMENTS.md` }, { status: 501 });
  }

  const rawBody = await req.text();
  try {
    const { events } = await adapter.verifyWebhook(req, rawBody);
    await applyPaymentEvents(events);
    return NextResponse.json({ received: true, applied: events.length });
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 });
    }
    // verified but processing failed → 500 so the provider retries
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
