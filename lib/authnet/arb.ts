// Authorize.Net ARB (Automated Recurring Billing). ARB stores only an
// amount + schedule — OUR database remains the source of truth for plan,
// price arm, status and period boundaries (Rule 9). We reference the stored
// Customer Profile so the same card recurs and can be updated later.
import { anetPost } from "./client";
import { statementDescriptor } from "./env";

function todayISO(): string {
  // ARB startDate must be today or later, format YYYY-MM-DD (UTC).
  return new Date().toISOString().slice(0, 10);
}

export interface CreatedSubscription {
  subscriptionId: string;
}

export async function createMonthlySubscription(opts: {
  amountCents: number;
  customerProfileId: string;
  customerPaymentProfileId: string;
  subscriptionName?: string;
}): Promise<CreatedSubscription> {
  const amount = (opts.amountCents / 100).toFixed(2);
  const res = await anetPost("ARBCreateSubscriptionRequest", {
    subscription: {
      name: (opts.subscriptionName || statementDescriptor()).slice(0, 50),
      paymentSchedule: {
        interval: { length: 1, unit: "months" },
        startDate: todayISO(),
        totalOccurrences: 9999, // "until canceled"
      },
      amount,
      profile: {
        customerProfileId: opts.customerProfileId,
        customerPaymentProfileId: opts.customerPaymentProfileId,
      },
    },
  });
  if (!res.ok || !res.raw.subscriptionId) {
    throw new Error(`Authorize.Net ARB error: ${res.code || ""} ${res.text || ""}`.trim());
  }
  return { subscriptionId: String(res.raw.subscriptionId) };
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const res = await anetPost("ARBCancelSubscriptionRequest", { subscriptionId });
  if (!res.ok) throw new Error(`Authorize.Net cancel error: ${res.code || ""} ${res.text || ""}`.trim());
}

export async function getSubscriptionStatus(subscriptionId: string): Promise<string> {
  const res = await anetPost("ARBGetSubscriptionStatusRequest", { subscriptionId });
  return res.raw?.status || "unknown";
}
