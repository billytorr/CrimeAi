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
  // ARB creates a CIM profile for an opaque-funded subscription and returns its
  // ids — we keep them for future card-management, but they're not on any
  // charge path (Rule 9: our DB is the source of truth).
  customerProfileId?: string;
  customerPaymentProfileId?: string;
}

// Create the recurring subscription DIRECTLY from an Accept.js opaque nonce.
// This is race-free: ARB creates the payment profile atomically as part of the
// subscription, so there's no separate create-then-charge propagation gap
// (which caused E00040). billTo IS allowed (and required) with opaque data.
export async function createMonthlySubscriptionFromOpaque(opts: {
  amountCents: number;
  opaque: { dataDescriptor: string; dataValue: string };
  firstName?: string;
  lastName?: string;
  subscriptionName?: string;
}): Promise<CreatedSubscription> {
  const amount = (opts.amountCents / 100).toFixed(2);
  const firstName = (opts.firstName || "CrimeAI").slice(0, 50);
  const lastName = (opts.lastName || "Member").slice(0, 50);
  const res = await anetPost("ARBCreateSubscriptionRequest", {
    subscription: {
      name: (opts.subscriptionName || statementDescriptor()).slice(0, 50),
      paymentSchedule: {
        interval: { length: 1, unit: "months" },
        startDate: todayISO(),
        totalOccurrences: 9999,
      },
      amount,
      // schema order: payment precedes billTo
      payment: { opaqueData: opts.opaque },
      billTo: { firstName, lastName },
    },
  });
  if (!res.ok || !res.raw.subscriptionId) {
    const all = res.raw?.messages?.message;
    const detail = Array.isArray(all) ? all.map((m: any) => `${m.code}:${m.text}`).join(" | ") : `${res.code || ""} ${res.text || ""}`;
    throw new Error(`Authorize.Net ARB error: ${detail}`.trim());
  }
  return {
    subscriptionId: String(res.raw.subscriptionId),
    customerProfileId: res.raw.profile?.customerProfileId ? String(res.raw.profile.customerProfileId) : undefined,
    customerPaymentProfileId: res.raw.profile?.customerPaymentProfileId ? String(res.raw.profile.customerPaymentProfileId) : undefined,
  };
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
