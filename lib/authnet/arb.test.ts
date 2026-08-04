import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn();
vi.mock("./client", () => ({ anetPost: (...a: any[]) => post(...a) }));
vi.mock("./env", () => ({ statementDescriptor: () => "PSCC-CRIMEAI PRO PLAN" }));

import { createMonthlySubscription } from "./arb";

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
