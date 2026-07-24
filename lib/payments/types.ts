// ════════════════════════════════════════════════════════════════════
// CrimeAI Payments — provider contract (server-side only)
//
// This is the interface EVERY merchant integration implements. It covers
// the full payment lifecycle the way large consumer apps structure it:
//
//   createCheckout      → start a subscription purchase
//   verifyWebhook       → authenticate the provider's callback and
//                         translate it into normalized events
//   cancelSubscription  → programmatic cancel (optional)
//   manageUrl           → customer self-service portal (optional)
//
// Adapters NEVER touch the database. They translate provider-specific
// payloads into NormalizedPaymentEvent values; lib/payments/fulfill.ts
// is the single place that grants/revokes the Protector plan and records
// payments — identical behavior no matter which merchant fired the event.
//
// To integrate a new merchant (Chase, Braintree, Adyen, …):
//   1. Copy lib/payments/providers/_template.ts
//   2. Implement the methods with the merchant's SDK/API
//   3. Register it in lib/payments/registry.ts
//   4. Point the merchant's webhook at /api/pay/webhook/<provider-id>
// Full walkthrough: PAYMENTS.md at the repo root.
// ════════════════════════════════════════════════════════════════════

/** Non-secret config chosen in Command Center → Finance (payment_config row). */
export interface PaymentConfig {
  provider: string;
  currency: string;
  /** Only used by hosted-link mode merchants. API adapters ignore it. */
  checkout_url?: string;
}

export interface CheckoutRequest {
  userId: string;      // auth.users id — MUST round-trip through the provider
  email: string;
  priceCents: number;
  planName: string;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

/** Everything a merchant can tell us, reduced to five events. */
export type PaymentEventType =
  | "subscription_started"   // first successful checkout → grant Protector
  | "payment_succeeded"      // renewal charge collected → record revenue
  | "subscription_updated"   // period end / status changed → sync record
  | "subscription_canceled"  // subscription ended → revert to free
  | "payment_refunded";      // money returned → record it

export interface NormalizedPaymentEvent {
  type: PaymentEventType;
  provider: string;
  /** Our auth.users id, when the provider echoes it back (client_reference_id etc.). */
  userId?: string;
  /** Provider's customer id — used to find the user when userId is absent (renewals, cancels). */
  customerId?: string;
  subscriptionId?: string;
  email?: string;
  amountCents?: number;
  currency?: string;
  /** Provider's charge/invoice/session id. Used for idempotency — webhooks retry. */
  externalId?: string;
  /** ISO timestamp of current_period_end, when the provider reports it. */
  periodEnd?: string;
}

export interface WebhookResult {
  /** Zero events is valid — providers send plenty of event types we ignore. */
  events: NormalizedPaymentEvent[];
}

/** Thrown by verifyWebhook when the signature/authentication check fails → HTTP 400. */
export class WebhookVerificationError extends Error {}

export interface PaymentProvider {
  id: string;
  label: string;
  /**
   * "api"         — fully integrated: programmatic checkout + verified webhooks.
   * "hosted-link" — stopgap: redirect to a pasted checkout URL, reconcile
   *                 manually in Command Center until the API adapter is built.
   */
  mode: "api" | "hosted-link";
  /** Server env vars this adapter needs. Drives the Finance integration-status panel. */
  requiredEnv: string[];
  /** True when the adapter has everything it needs to take a live payment. */
  ready(conf: PaymentConfig): boolean;
  /** Create a checkout and return the URL to send the user to. */
  createCheckout(req: CheckoutRequest, conf: PaymentConfig): Promise<{ url: string }>;
  /**
   * Authenticate the provider's webhook (signature/HMAC/basic auth — whatever
   * the merchant uses) and translate the payload into normalized events.
   * MUST throw WebhookVerificationError on any authentication failure.
   * `rawBody` is the exact bytes received — most signature schemes need it.
   */
  verifyWebhook?(req: Request, rawBody: string): Promise<WebhookResult>;
  /** Cancel a subscription at the merchant (called from Command Center revoke). */
  cancelSubscription?(subscriptionId: string): Promise<void>;
  /** Self-service billing portal (update card, cancel) for the user. */
  manageUrl?(customerId: string, returnUrl: string): Promise<{ url: string }>;
}
