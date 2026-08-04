// Pure mapping from an Authorize.Net webhook event to a subscription-state
// intent. No DB, no network — so every transition is unit-testable. The route
// applies the returned `update` to tier_subscriptions and sends `email`.
//
// Dunning (Rule 7): a failed recurring charge suspends the ARB subscription;
// we move to past_due and keep access until grace_until (now + graceDays).
// Access is only lost AFTER grace — enforced on the read side by
// effectivePlan(), and swept to 'canceled' by reconciliation once grace ends.

export const ANET_EVENTS = {
  SUSPENDED: "net.authorize.customer.subscription.suspended",
  TERMINATED: "net.authorize.customer.subscription.terminated",
  CANCELLED: "net.authorize.customer.subscription.cancelled",
  EXPIRED: "net.authorize.customer.subscription.expired",
  EXPIRING: "net.authorize.customer.subscription.expiring",
  AUTHCAPTURE: "net.authorize.payment.authcapture.created",
  REFUND: "net.authorize.payment.refund.created",
} as const;

export type EmailKind = "payment_failed" | "canceled" | "receipt" | null;

export interface SubscriptionUpdate {
  status?: string;
  grace_until?: string | null;
}

export interface WebhookDecision {
  action: "suspend" | "cancel" | "expire" | "noop";
  update: SubscriptionUpdate; // fields to write to tier_subscriptions
  email: EmailKind;           // customer email to send (null = none)
}

const NOOP: WebhookDecision = { action: "noop", update: {}, email: null };

export function graceUntil(now: number, graceDays: number): string {
  return new Date(now + Math.max(0, graceDays) * 86_400_000).toISOString();
}

// Decide the effect of a SUBSCRIPTION lifecycle event. Payment-transaction
// events (receipts, period advance) are resolved in the route because they
// need a transaction-details lookup.
export function decideSubscriptionEvent(eventType: string, now: number, graceDays: number): WebhookDecision {
  switch (eventType) {
    case ANET_EVENTS.SUSPENDED:
      // card failed / retries exhausted → dunning window opens
      return { action: "suspend", update: { status: "past_due", grace_until: graceUntil(now, graceDays) }, email: "payment_failed" };
    case ANET_EVENTS.TERMINATED:
    case ANET_EVENTS.CANCELLED:
      return { action: "cancel", update: { status: "canceled", grace_until: null }, email: "canceled" };
    case ANET_EVENTS.EXPIRED:
      return { action: "expire", update: { status: "expired", grace_until: null }, email: null };
    default:
      // created/updated/expiring and anything unknown: don't touch status.
      return NOOP;
  }
}

export function graceDaysFromEnv(): number {
  const n = parseInt(process.env.TIER_GRACE_DAYS || "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 7; // Rule 7 default
}
