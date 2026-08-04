import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn();
vi.mock("./client", () => ({ anetPost: (...a: any[]) => post(...a) }));
vi.mock("./env", () => ({ anetEnv: () => "sandbox" }));

import { createCustomerProfileFromOpaque } from "./customer-profile";

const opaque = { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "abc" };
beforeEach(() => post.mockReset());

describe("createCustomerProfileFromOpaque", () => {
  it("stores the billing name ON the payment profile (ARB needs it there)", async () => {
    post
      .mockResolvedValueOnce({ ok: true, raw: { customerProfileId: "900" } }) // create
      .mockResolvedValueOnce({ ok: true, raw: { profile: { paymentProfiles: [{ customerPaymentProfileId: "9001", payment: { creditCard: { cardNumber: "XXXX1111", cardType: "Visa" } } }] } } }); // getCustomerProfile
    const card = await createCustomerProfileFromOpaque("user-abc", "a@b.com", opaque, "Maria Lopez");
    const billTo = post.mock.calls[0][1].profile.paymentProfiles[0].billTo;
    expect(billTo).toEqual({ firstName: "Maria", lastName: "Lopez" });
    expect(card).toEqual({ customerProfileId: "900", customerPaymentProfileId: "9001", last4: "1111", brand: "Visa" });
  });

  it("falls back to a safe billing name when none is given", async () => {
    post
      .mockResolvedValueOnce({ ok: true, raw: { customerProfileId: "1" } })
      .mockResolvedValueOnce({ ok: true, raw: { profile: { paymentProfiles: { customerPaymentProfileId: "2", payment: { creditCard: {} } } } } });
    await createCustomerProfileFromOpaque("u", "", opaque, "");
    expect(post.mock.calls[0][1].profile.paymentProfiles[0].billTo).toEqual({ firstName: "CrimeAI", lastName: "Member" });
  });

  it("REUSES an existing profile on E00039 duplicate (returning subscriber)", async () => {
    post
      .mockResolvedValueOnce({ ok: false, raw: { messages: { message: [{ code: "E00039", text: "A duplicate record with ID 527349081 already exists." }] } } })
      .mockResolvedValueOnce({ ok: true, raw: { profile: { paymentProfiles: [{ customerPaymentProfileId: "539420689", payment: { creditCard: { cardNumber: "XXXX4242", cardType: "Mastercard" } } }] } } });
    const card = await createCustomerProfileFromOpaque("user-abc", "a@b.com", opaque, "Sam Smith");
    expect(card.customerProfileId).toBe("527349081");
    expect(card.customerPaymentProfileId).toBe("539420689");
    expect(card.last4).toBe("4242");
    // getCustomerProfile was called with the extracted existing id
    expect(post.mock.calls[1][1]).toEqual({ customerProfileId: "527349081" });
  });

  it("throws on a non-duplicate create error", async () => {
    post.mockResolvedValueOnce({ ok: false, raw: { messages: { message: [{ code: "E00013", text: "bad field" }] } } });
    await expect(createCustomerProfileFromOpaque("u", "", opaque, "A B")).rejects.toThrow(/E00013/);
  });
});
