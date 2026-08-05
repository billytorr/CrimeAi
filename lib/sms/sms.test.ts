import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV_KEYS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("twilio adapter — dormant-safe", () => {
  it("no-ops without credentials (never throws, never fetches)", async () => {
    const { sendSms, smsConfigured } = await import("./twilio");
    expect(smsConfigured()).toBe(false);
    const r = await sendSms("+13055550100", "hi");
    expect(r.sent).toBe(false);
    expect(r.skipped).toMatch(/not configured/);
  });

  it("rejects an invalid recipient even when configured", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC1"; process.env.TWILIO_AUTH_TOKEN = "t"; process.env.TWILIO_FROM = "+15555550100";
    const { sendSms } = await import("./twilio");
    const r = await sendSms("not-a-number", "hi");
    expect(r.sent).toBe(false);
    expect(r.skipped).toMatch(/recipient/);
  });
});

describe("sendAlertSms — metered cost path", () => {
  it("does not consume allowance when Twilio isn't configured", async () => {
    vi.resetModules();
    const consume = vi.fn();
    vi.doMock("@/lib/entitlements/enforce", () => ({ enforceConsume: consume }));
    const { sendAlertSms } = await import("./alerts");
    const r = await sendAlertSms("u1", "+13055550100", "alert");
    expect(r.sent).toBe(false);
    expect(r.metered).toBe(false);
    expect(consume).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/entitlements/enforce");
  });

  it("blocks the send when the allowance is exhausted (fail-closed, no spend)", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC1"; process.env.TWILIO_AUTH_TOKEN = "t"; process.env.TWILIO_FROM = "+15555550100";
    vi.resetModules();
    const send = vi.fn();
    vi.doMock("@/lib/entitlements/enforce", () => ({ enforceConsume: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, reason: "limit_reached" }) }));
    vi.doMock("./twilio", () => ({ smsConfigured: () => true, sendSms: send }));
    const { sendAlertSms } = await import("./alerts");
    const r = await sendAlertSms("u1", "+13055550100", "alert");
    expect(r.sent).toBe(false);
    expect(r.metered).toBe(true);
    expect(send).not.toHaveBeenCalled(); // no unpaid SMS ever leaves
    vi.doUnmock("@/lib/entitlements/enforce"); vi.doUnmock("./twilio");
  });

  it("sends when the allowance permits", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC1"; process.env.TWILIO_AUTH_TOKEN = "t"; process.env.TWILIO_FROM = "+15555550100";
    vi.resetModules();
    const send = vi.fn().mockResolvedValue({ sent: true, sid: "SM1" });
    vi.doMock("@/lib/entitlements/enforce", () => ({ enforceConsume: vi.fn().mockResolvedValue({ allowed: true, remaining: 4 }) }));
    vi.doMock("./twilio", () => ({ smsConfigured: () => true, sendSms: send }));
    const { sendAlertSms } = await import("./alerts");
    const r = await sendAlertSms("u1", "+13055550100", "alert");
    expect(r.sent).toBe(true);
    expect(send).toHaveBeenCalledWith("+13055550100", "alert");
    vi.doUnmock("@/lib/entitlements/enforce"); vi.doUnmock("./twilio");
  });
});
