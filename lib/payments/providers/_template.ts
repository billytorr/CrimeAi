// ════════════════════════════════════════════════════════════════════
// TEMPLATE — copy this file to integrate ANY merchant / payment provider.
//
//   cp _template.ts chase.ts        (or braintree.ts, adyen.ts, …)
//
// Then:
//   1. Fill in the four methods below with the merchant's API/SDK.
//   2. Register the adapter in ../registry.ts:
//        import { chaseProvider } from "./providers/chase";
//        // replace the hostedLinkProvider("chase", …) line with:
//        chase: chaseProvider,
//   3. Add the secret env vars to Vercel (and .env.local for dev).
//      Convention: <PROVIDER>_SECRET_KEY, <PROVIDER>_WEBHOOK_SECRET.
//   4. Point the merchant's webhook at:
//        https://app.publicsafetycrimecenter.com/api/pay/webhook/<id>
//   5. Select the provider in Command Center → Finance. Done — checkout,
//      fulfillment, renewals, cancels and refunds all flow automatically.
//
// Rules of the contract (see ../types.ts and PAYMENTS.md):
//   • Secrets ONLY from process.env — never from the database or client.
//   • The user id MUST round-trip: send req.userId to the merchant at
//     checkout, read it back in verifyWebhook. Every merchant has a slot
//     for this (metadata, reference, custom field, invoice number…).
//   • verifyWebhook MUST authenticate the request (HMAC signature, basic
//     auth, mTLS — whatever the merchant supports) and MUST throw
//     WebhookVerificationError if the check fails. Never trust an
//     unauthenticated webhook: it can grant free Protector plans.
//   • Adapters never touch the database — return normalized events and
//     the fulfillment engine (../fulfill.ts) does the rest.
// ════════════════════════════════════════════════════════════════════
import type { CheckoutRequest, PaymentConfig, PaymentProvider, WebhookResult } from "../types";
import { WebhookVerificationError } from "../types";

const ID = "example"; // ← the provider id used in payment_config + webhook URL

export const exampleProvider: PaymentProvider = {
  id: ID,
  label: "Example Merchant",
  mode: "api",
  // listed in Command Center → Finance so back-office can see what's missing
  requiredEnv: ["EXAMPLE_SECRET_KEY", "EXAMPLE_WEBHOOK_SECRET"],

  ready: () => !!process.env.EXAMPLE_SECRET_KEY,

  // 1️⃣ CHECKOUT — create a payment session at the merchant, return its URL.
  async createCheckout(req: CheckoutRequest, _conf: PaymentConfig) {
    // Typical shape — swap for the merchant's real API:
    //
    // const r = await fetch("https://api.example.com/v1/checkout-sessions", {
    //   method: "POST",
    //   headers: { Authorization: `Bearer ${process.env.EXAMPLE_SECRET_KEY}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     amount: req.priceCents,
    //     currency: req.currency,
    //     recurring: "monthly",
    //     description: `CrimeAI ${req.planName}`,
    //     customer_email: req.email,
    //     reference: req.userId,          // ← REQUIRED: round-trips in the webhook
    //     success_url: req.successUrl,
    //     cancel_url: req.cancelUrl,
    //   }),
    // });
    // const session = await r.json();
    // return { url: session.checkout_url };
    throw new Error(`${ID} createCheckout not implemented`);
  },

  // 2️⃣ WEBHOOK — authenticate, then translate payloads → normalized events.
  async verifyWebhook(req: Request, rawBody: string): Promise<WebhookResult> {
    // ── authenticate (example: HMAC-SHA256 of the raw body) ──
    // import crypto from "node:crypto";
    // const expected = crypto.createHmac("sha256", process.env.EXAMPLE_WEBHOOK_SECRET!)
    //   .update(rawBody).digest("hex");
    // if (req.headers.get("x-example-signature") !== expected) {
    //   throw new WebhookVerificationError("Bad signature");
    // }
    //
    // ── translate merchant events → the five normalized types ──
    // const payload = JSON.parse(rawBody);
    // switch (payload.event_type) {
    //   case "checkout.completed":
    //     return { events: [{
    //       type: "subscription_started",
    //       provider: ID,
    //       userId: payload.data.reference,          // the id we sent at checkout
    //       customerId: payload.data.customer_id,
    //       subscriptionId: payload.data.subscription_id,
    //       email: payload.data.email,
    //       amountCents: payload.data.amount,
    //       currency: payload.data.currency,
    //       externalId: payload.data.transaction_id, // idempotency key
    //     }] };
    //   case "payment.collected":      → type: "payment_succeeded"
    //   case "subscription.canceled":  → type: "subscription_canceled"
    //   case "payment.refunded":       → type: "payment_refunded"
    //   default: return { events: [] };  // ignore everything else
    // }
    throw new WebhookVerificationError(`${ID} verifyWebhook not implemented`);
  },

  // 3️⃣ CANCEL — used by Command Center revoke (optional but recommended).
  async cancelSubscription(_subscriptionId: string) {
    // await fetch(`https://api.example.com/v1/subscriptions/${_subscriptionId}/cancel`, { … });
    throw new Error(`${ID} cancelSubscription not implemented`);
  },

  // 4️⃣ PORTAL — where users update their card / cancel (optional).
  // async manageUrl(customerId: string, returnUrl: string) { … }
};
