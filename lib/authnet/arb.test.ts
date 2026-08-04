import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn();
vi.mock("./client", () => ({ anetPost: (...a: any[]) => post(...a) }));
vi.mock("./env", () => ({ statementDescriptor: () => "PSCC-CRIMEAI PRO PLAN" }));

import { createMonthlySubscription, createMonthlySubscriptionFromOpaque } from "./arb";

const ok = (subscriptionId: string) => ({ ok: true, resultCode: "Ok", raw: { subscriptionId } });
const err = (code: string, text = "x") => ({ ok: false, resultCode: "Error", raw: { messages: { message: [{ code, text }] } } });

beforeEach(() => post.mockReset());

describe("createMonthlySubscription", () => {
  it("retries on E00040 (profile-propagation race) then succeeds", async () => {
    post.mockResolvedValueOnce(err("E00040")).mockResolvedValueOnce(err("E00040")).mockResolvedValueOnce(ok("777"));
    const r = await createMonthlySubscription({ amountCents: 499, customerProfileId: "p1", customerPaymentProfileId: "pp1" });
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
    await expect(createMonthlySubscription({ amountCents: 499, customerProfileId: "p", customerPaymentProfileId: "pp" }))
      .rejects.toThrow(/E00040/);
    expect(post.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

const opaque = { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "nonce" };

describe("createMonthlySubscriptionFromOpaque (direct, race-free)", () => {
  it("funds the subscription from the opaque nonce WITH billTo, and returns the ARB-created profile ids", async () => {
    post.mockResolvedValueOnce({ ok: true, resultCode: "Ok", raw: { subscriptionId: "555", profile: { customerProfileId: "cp1", customerPaymentProfileId: "pp1" } } });
    const r = await createMonthlySubscriptionFromOpaque({ amountCents: 499, opaque, firstName: "Maria", lastName: "Lopez" });
    expect(r).toEqual({ subscriptionId: "555", customerProfileId: "cp1", customerPaymentProfileId: "pp1" });
    const sub = post.mock.calls[0][1].subscription;
    expect(sub.payment).toEqual({ opaqueData: opaque });
    expect(sub.billTo).toEqual({ firstName: "Maria", lastName: "Lopez" });
    expect(sub.amount).toBe("4.99");
  });

  it("surfaces the ARB error (e.g. a decline) instead of writing a subscription", async () => {
    post.mockResolvedValueOnce(err("E00027", "This transaction has been declined."));
    await expect(createMonthlySubscriptionFromOpaque({ amountCents: 499, opaque })).rejects.toThrow(/declined/);
  });

  it("still returns the subscription id even if ARB omits the profile block", async () => {
    post.mockResolvedValueOnce({ ok: true, resultCode: "Ok", raw: { subscriptionId: "9" } });
    const r = await createMonthlySubscriptionFromOpaque({ amountCents: 799, opaque });
    expect(r.subscriptionId).toBe("9");
    expect(r.customerProfileId).toBeUndefined();
  });
});
