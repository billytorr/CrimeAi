import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn();
vi.mock("./client", () => ({ anetPost: (...a: any[]) => post(...a) }));
vi.mock("./env", () => ({ statementDescriptor: () => "PSCC-CRIMEAI PRO PLAN" }));

import { createMonthlySubscription, chargeStoredProfile, nextPeriodISO } from "./arb";

const ok = (subscriptionId: string) => ({ ok: true, resultCode: "Ok", raw: { subscriptionId } });
const err = (code: string, text = "x") => ({ ok: false, resultCode: "Error", raw: { messages: { message: [{ code, text }] } } });

beforeEach(() => post.mockReset());

describe("createMonthlySubscription", () => {
  const fast = { retryDelayMs: 1 };

  it("retries on E00040 (profile-propagation race) then succeeds", async () => {
    post.mockResolvedValueOnce(err("E00040")).mockResolvedValueOnce(err("E00040")).mockResolvedValueOnce(ok("777"));
    const r = await createMonthlySubscription({ amountCents: 499, customerProfileId: "p1", customerPaymentProfileId: "pp1", ...fast });
    expect(r.subscriptionId).toBe("777");
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry on other errors — fails fast", async () => {
    post.mockResolvedValueOnce(err("E00027", "declined"));
    await expect(createMonthlySubscription({ amountCents: 499, customerProfileId: "p", customerPaymentProfileId: "pp" }))
      .rejects.toThrow(/E00027/);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("charges the stored profile and sends NO billTo (ARB rejects it: E00093)", async () => {
    post.mockResolvedValueOnce(ok("42"));
    await createMonthlySubscription({ amountCents: 799, customerProfileId: "cp", customerPaymentProfileId: "pp" });
    const sub = post.mock.calls[0][1].subscription;
    expect(sub.billTo).toBeUndefined();
    expect(sub.profile).toEqual({ customerProfileId: "cp", customerPaymentProfileId: "pp" });
    expect(sub.amount).toBe("7.99");
    expect(sub.paymentSchedule.interval).toEqual({ length: 1, unit: "months" });
  });

  it("gives up after the retry budget and surfaces the last error", async () => {
    post.mockResolvedValue(err("E00040"));
    await expect(createMonthlySubscription({ amountCents: 499, customerProfileId: "p", customerPaymentProfileId: "pp", retryAttempts: 3, ...fast }))
      .rejects.toThrow(/E00040/);
    expect(post.mock.calls.length).toBe(4); // 1 initial + 3 retries
  });
});

// ══════════════════════════════════════════════════════════════════
// The bug these cover: a subscriber was marked active and never charged.
// ARB does not bill when a subscription is created — it waits for the next
// daily batch — so the first period has to be charged explicitly.
// ══════════════════════════════════════════════════════════════════
const approved = (transId = "60123", authCode = "ABC123") => ({
  ok: true, resultCode: "Ok",
  raw: { transactionResponse: { responseCode: "1", transId, authCode, accountNumber: "XXXX1111" } },
});
const declined = (errorText = "This transaction has been declined.") => ({
  ok: true, resultCode: "Ok", // envelope says Ok — the TRANSACTION is what failed
  raw: { transactionResponse: { responseCode: "2", errors: [{ errorCode: "2", errorText }] } },
});

const CHARGE = { amountCents: 799, customerProfileId: "cp1", customerPaymentProfileId: "pp1", retryAttempts: 2, retryDelayMs: 1 };

describe("chargeStoredProfile", () => {
  beforeEach(() => post.mockReset());

  it("charges the stored profile and returns the transaction id", async () => {
    post.mockResolvedValue(approved("60999"));
    const r = await chargeStoredProfile(CHARGE);
    expect(r.transactionId).toBe("60999");
    expect(r.last4).toBe("1111");

    const [action, body] = post.mock.calls[0];
    expect(action).toBe("createTransactionRequest");
    expect(body.transactionRequest.transactionType).toBe("authCaptureTransaction");
    expect(body.transactionRequest.amount).toBe("7.99");
    expect(body.transactionRequest.profile.paymentProfile.paymentProfileId).toBe("pp1");
  });

  it("THROWS on a decline even though the envelope says Ok", async () => {
    // This is the trap: resultCode 'Ok' means the API call worked, NOT that
    // money moved. Treating it as success is how you comp a non-paying user.
    post.mockResolvedValue(declined("Insufficient funds"));
    await expect(chargeStoredProfile(CHARGE)).rejects.toThrow(/Insufficient funds/);
  });

  it("retries E00040 while a fresh profile propagates, then succeeds", async () => {
    post.mockResolvedValueOnce(err("E00040")).mockResolvedValueOnce(approved());
    const r = await chargeStoredProfile(CHARGE);
    expect(r.transactionId).toBe("60123");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget", async () => {
    post.mockResolvedValue(err("E00040"));
    await expect(chargeStoredProfile(CHARGE)).rejects.toThrow(/not charged/i);
  });
});

describe("nextPeriodISO", () => {
  it("monthly → one month out", () => {
    expect(nextPeriodISO("month", new Date("2026-03-15T12:00:00Z"))).toBe("2026-04-15");
  });
  it("annual → one year out", () => {
    expect(nextPeriodISO("year", new Date("2026-03-15T12:00:00Z"))).toBe("2027-03-15");
  });
});

describe("createMonthlySubscription — interval + start date", () => {
  beforeEach(() => post.mockReset());

  it("starts recurring billing at the NEXT period, never today", async () => {
    // Starting today would bill a second time for the period already paid.
    post.mockResolvedValue(ok("sub1"));
    await createMonthlySubscription({
      amountCents: 799, customerProfileId: "cp1", customerPaymentProfileId: "pp1",
      interval: "month", startDate: "2026-04-15",
    });
    expect(post.mock.calls[0][1].subscription.paymentSchedule.startDate).toBe("2026-04-15");
  });

  it("expresses an annual plan as 12 months — ARB has no 'years' unit", async () => {
    post.mockResolvedValue(ok("sub2"));
    await createMonthlySubscription({
      amountCents: 6999, customerProfileId: "cp1", customerPaymentProfileId: "pp1", interval: "year",
    });
    expect(post.mock.calls[0][1].subscription.paymentSchedule.interval).toEqual({ length: 12, unit: "months" });
  });

  it("defaults to a 1-month interval", async () => {
    post.mockResolvedValue(ok("sub3"));
    await createMonthlySubscription({ amountCents: 799, customerProfileId: "cp1", customerPaymentProfileId: "pp1" });
    expect(post.mock.calls[0][1].subscription.paymentSchedule.interval).toEqual({ length: 1, unit: "months" });
  });
});
