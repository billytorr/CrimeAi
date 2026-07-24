// Stripe — the REFERENCE implementation of the PaymentProvider contract.
// Every method here shows the pattern a new merchant adapter should follow.
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// Webhook endpoint: https://app.publicsafetycrimecenter.com/api/pay/webhook/stripe
// Events to enable in the Stripe dashboard: checkout.session.completed,
// invoice.paid, customer.subscription.updated, customer.subscription.deleted,
// charge.refunded
import type { CheckoutRequest, PaymentConfig, PaymentProvider, NormalizedPaymentEvent, WebhookResult } from "../types";
import { WebhookVerificationError } from "../types";

async function client() {
  const Stripe = (await import("stripe")).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",
  label: "Stripe",
  mode: "api",
  requiredEnv: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  ready: () => !!process.env.STRIPE_SECRET_KEY,

  async createCheckout(req: CheckoutRequest, _conf: PaymentConfig) {
    const stripe = await client();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: req.userId, // round-trips back in the webhook
      customer_email: req.email || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: req.currency || "usd",
          unit_amount: req.priceCents,
          recurring: { interval: "month" },
          product_data: { name: `CrimeAI ${req.planName}` },
        },
      }],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
    });
    return { url: session.url! };
  },

  async verifyWebhook(req: Request, rawBody: string): Promise<WebhookResult> {
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new WebhookVerificationError("STRIPE_WEBHOOK_SECRET not set");
    const stripe = await client();
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, req.headers.get("stripe-signature") || "", process.env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new WebhookVerificationError("Bad Stripe signature");
    }

    const events: NormalizedPaymentEvent[] = [];
    const o = event.data.object as any;

    switch (event.type) {
      case "checkout.session.completed":
        if (o.client_reference_id) {
          events.push({
            type: "subscription_started",
            provider: "stripe",
            userId: o.client_reference_id,
            customerId: o.customer || undefined,
            subscriptionId: o.subscription || undefined,
            email: o.customer_details?.email || undefined,
            amountCents: o.amount_total ?? undefined,
            currency: o.currency || "usd",
            externalId: o.id,
          });
        }
        break;
      case "invoice.paid":
        if (o.billing_reason === "subscription_cycle") {
          events.push({
            type: "payment_succeeded",
            provider: "stripe",
            customerId: o.customer,
            subscriptionId: o.subscription || undefined,
            amountCents: o.amount_paid,
            currency: o.currency || "usd",
            externalId: o.id,
            periodEnd: o.lines?.data?.[0]?.period?.end ? new Date(o.lines.data[0].period.end * 1000).toISOString() : undefined,
          });
        }
        break;
      case "customer.subscription.updated":
        events.push({
          type: "subscription_updated",
          provider: "stripe",
          customerId: o.customer,
          subscriptionId: o.id,
          periodEnd: o.current_period_end ? new Date(o.current_period_end * 1000).toISOString() : undefined,
        });
        break;
      case "customer.subscription.deleted":
        events.push({ type: "subscription_canceled", provider: "stripe", customerId: o.customer, subscriptionId: o.id });
        break;
      case "charge.refunded":
        events.push({
          type: "payment_refunded",
          provider: "stripe",
          customerId: o.customer || undefined,
          amountCents: o.amount_refunded,
          currency: o.currency || "usd",
          externalId: o.id,
        });
        break;
      // every other Stripe event type is intentionally ignored
    }
    return { events };
  },

  async cancelSubscription(subscriptionId: string) {
    const stripe = await client();
    await stripe.subscriptions.cancel(subscriptionId);
  },

  async manageUrl(customerId: string, returnUrl: string) {
    const stripe = await client();
    const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { url: session.url };
  },
};
