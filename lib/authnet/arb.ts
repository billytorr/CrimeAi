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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function createMonthlySubscription(opts: {
  amountCents: number;
  customerProfileId: string;
  customerPaymentProfileId: string;
  subscriptionName?: string;
}): Promise<CreatedSubscription> {
  const amount = (opts.amountCents / 100).toFixed(2);
  // NOTE: when charging a stored customer/payment profile, ARB does NOT accept
  // a billTo in the request (E00093). The billing name lives ON the payment
  // profile, set when it was created (see createCustomerProfileFromOpaque).
  const body = {
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
  };

  // A just-created customer/payment profile isn't immediately visible to ARB
  // (E00040 "record cannot be found"). This is a create-then-subscribe race in
  // the same request; retry a few times with backoff until the profile lands.
  let res = await anetPost("ARBCreateSubscriptionRequest", body);
  for (let attempt = 0; attempt < 4 && !res.ok && anetCode(res) === "E00040"; attempt++) {
    await sleep(1200);
    res = await anetPost("ARBCreateSubscriptionRequest", body);
  }

  if (!res.ok || !res.raw.subscriptionId) {
    const all = res.raw?.messages?.message;
    const detail = Array.isArray(all) ? all.map((m: any) => `${m.code}:${m.text}`).join(" | ") : `${res.code || ""} ${res.text || ""}`;
    throw new Error(`Authorize.Net ARB error: ${detail} (profile=${opts.customerProfileId} payment=${opts.customerPaymentProfileId})`.trim());
  }
  return { subscriptionId: String(res.raw.subscriptionId) };
}

function anetCode(res: { raw?: any; code?: string }): string {
  const m = res.raw?.messages?.message;
  return (Array.isArray(m) ? m[0]?.code : m?.code) || res.code || "";
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const res = await anetPost("ARBCancelSubscriptionRequest", { subscriptionId });
  if (!res.ok) throw new Error(`Authorize.Net cancel error: ${res.code || ""} ${res.text || ""}`.trim());
}

export async function getSubscriptionStatus(subscriptionId: string): Promise<string> {
  const res = await anetPost("ARBGetSubscriptionStatusRequest", { subscriptionId });
  return res.raw?.status || "unknown";
}
