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

export type BillingInterval = "month" | "year";

/** One billing period from now, as ARB's YYYY-MM-DD. */
export function nextPeriodISO(interval: BillingInterval, from: Date = new Date()): string {
  const d = new Date(from);
  if (interval === "year") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export interface ChargeResult { transactionId: string; authCode?: string; last4?: string }

/**
 * Charge a stored Customer Profile ONCE, right now.
 *
 * ⚠️ THIS IS WHY SUBSCRIBERS WERE NOT BEING BILLED. ARB never charges at the
 * moment you create a subscription — even with startDate = today it bills in
 * Authorize.Net's next daily batch. Meanwhile our database flipped the user
 * to `active` immediately, so they got Protector before any money moved (and
 * in sandbox testMode, often no money ever moved).
 *
 * The correct shape is: charge the first period HERE, then start ARB one
 * period later so nobody is billed twice for the same month.
 */
export async function chargeStoredProfile(opts: {
  amountCents: number;
  customerProfileId: string;
  customerPaymentProfileId: string;
  description?: string;
  invoiceNumber?: string;
  retryAttempts?: number;
  retryDelayMs?: number;
}): Promise<ChargeResult> {
  const retryAttempts = opts.retryAttempts ?? 10;
  const retryDelayMs = opts.retryDelayMs ?? 2000;
  const body = {
    transactionRequest: {
      transactionType: "authCaptureTransaction",
      amount: (opts.amountCents / 100).toFixed(2),
      profile: {
        customerProfileId: opts.customerProfileId,
        paymentProfile: { paymentProfileId: opts.customerPaymentProfileId },
      },
      order: {
        invoiceNumber: (opts.invoiceNumber || `PSCC-${Date.now()}`).slice(0, 20),
        description: (opts.description || statementDescriptor()).slice(0, 255),
      },
    },
  };

  // Same create-then-charge race the subscription hits (E00040).
  let res = await anetPost("createTransactionRequest", body);
  for (let attempt = 0; attempt < retryAttempts && !res.ok && anetCode(res) === "E00040"; attempt++) {
    await sleep(retryDelayMs);
    res = await anetPost("createTransactionRequest", body);
  }

  // resultCode can be "Ok" while the TRANSACTION itself was declined, so the
  // envelope alone is not proof of payment — responseCode 1 is.
  const txn = res.raw?.transactionResponse;
  const approved = txn?.responseCode === "1" || txn?.responseCode === 1;
  if (!approved) {
    const errs = txn?.errors?.[0] || txn?.errors;
    const detail = errs?.errorText || errs?.[0]?.errorText
      || (Array.isArray(res.raw?.messages?.message)
          ? res.raw.messages.message.map((m: any) => `${m.code}:${m.text}`).join(" | ")
          : `${res.code || ""} ${res.text || ""}`);
    throw new Error(`Card was not charged: ${String(detail).trim() || "declined"}`);
  }

  return {
    transactionId: String(txn.transId || ""),
    authCode: txn.authCode ? String(txn.authCode) : undefined,
    last4: txn.accountNumber ? String(txn.accountNumber).slice(-4) : undefined,
  };
}

export interface CreatedSubscription {
  subscriptionId: string;
}

// NOTE: an Accept.js opaque nonce CANNOT fund ARBCreateSubscription directly —
// Authorize.Net returns E00114 "Invalid OTS Token" (verified against the live
// sandbox, twice). The nonce must first be turned into a Customer Profile
// (createCustomerProfileFromOpaque); ARB then charges that stored profile.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function createMonthlySubscription(opts: {
  amountCents: number;
  customerProfileId: string;
  customerPaymentProfileId: string;
  subscriptionName?: string;
  /** month (default) or year — matches tier_prices.interval. */
  interval?: BillingInterval;
  /**
   * When recurring billing begins, YYYY-MM-DD.
   *
   * ⚠️ PASS THE NEXT PERIOD, NOT TODAY. The first period is charged
   * immediately by chargeStoredProfile(); leaving this at today would bill
   * the customer a second time for a period they have already paid for.
   * Defaults to today only so existing callers keep their old behaviour.
   */
  startDate?: string;
  // E00040-retry tuning (defaults chosen for production; tests override to run fast)
  retryAttempts?: number;
  retryDelayMs?: number;
}): Promise<CreatedSubscription> {
  // Sandbox propagation lag is VARIABLE (observed instant to >100s); use as
  // much of the route's 30s budget as we safely can (~20s of retrying).
  const retryAttempts = opts.retryAttempts ?? 10;
  const retryDelayMs = opts.retryDelayMs ?? 2000;
  const amount = (opts.amountCents / 100).toFixed(2);
  // NOTE: when charging a stored customer/payment profile, ARB does NOT accept
  // a billTo in the request (E00093). The billing name lives ON the payment
  // profile, set when it was created (see createCustomerProfileFromOpaque).
  const body = {
    subscription: {
      name: (opts.subscriptionName || statementDescriptor()).slice(0, 50),
      paymentSchedule: {
        // ARB accepts only "days" or "months" — an annual plan is 12 months.
        interval: { length: opts.interval === "year" ? 12 : 1, unit: "months" },
        startDate: opts.startDate || todayISO(),
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
  // the same request; retry with backoff until the profile lands. The lag is a
  // sandbox-testMode artifact expected to be absent under production liveMode
  // (which validates the card with a real auth, materializing the profile).
  let res = await anetPost("ARBCreateSubscriptionRequest", body);
  for (let attempt = 0; attempt < retryAttempts && !res.ok && anetCode(res) === "E00040"; attempt++) {
    await sleep(retryDelayMs);
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

export interface TxnSubscriptionInfo {
  subscriptionId: string | null;
  payNum: number | null;
  amountCents: number;
  submitTimeUTC: string | null;
  cardBrand: string | null;
  last4: string | null;
}

// Look up a transaction and, if it was generated by an ARB subscription,
// return the subscription id + masked card so a recurring-charge webhook can
// be tied back to our subscription row (webhooks only carry the transId).
export async function getTransactionSubscription(transId: string): Promise<TxnSubscriptionInfo | null> {
  const res = await anetPost("getTransactionDetailsRequest", { transId });
  if (!res.ok) return null;
  const t = res.raw?.transaction;
  if (!t) return null;
  const cc = t.payment?.creditCard;
  const amt = parseFloat(t.authAmount ?? t.settleAmount ?? "0");
  return {
    subscriptionId: t.subscription?.id != null ? String(t.subscription.id) : null,
    payNum: t.subscription?.payNum != null ? Number(t.subscription.payNum) : null,
    amountCents: Math.round((Number.isFinite(amt) ? amt : 0) * 100),
    submitTimeUTC: t.submitTimeUTC || null,
    cardBrand: cc?.cardType || null,
    last4: cc?.cardNumber ? String(cc.cardNumber).replace(/[^0-9]/g, "").slice(-4) : null,
  };
}
