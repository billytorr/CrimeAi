import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sendEmail, emailFrom } from "./resend";

describe("resend adapter — dormant-safe", () => {
  const prev = process.env.RESEND_API_KEY;
  beforeEach(() => { delete process.env.RESEND_API_KEY; });
  afterEach(() => { if (prev === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = prev; });

  it("no-ops (does not throw or fetch) when RESEND_API_KEY is unset", async () => {
    const r = await sendEmail({ to: "a@b.com", subject: "hi", html: "<p>hi</p>" });
    expect(r.sent).toBe(false);
    expect(r.skipped).toMatch(/RESEND_API_KEY/);
  });

  it("skips an invalid recipient even with a key set", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const r = await sendEmail({ to: "not-an-email", subject: "hi", html: "<p>hi</p>" });
    expect(r.sent).toBe(false);
    expect(r.skipped).toMatch(/recipient/);
  });

  it("defaults the from address to the verified-root receipts@ sender", () => {
    const prevFrom = process.env.PAYMENTS_EMAIL_FROM; delete process.env.PAYMENTS_EMAIL_FROM;
    expect(emailFrom()).toContain("receipts@publicsafetycrimecenter.com");
    if (prevFrom !== undefined) process.env.PAYMENTS_EMAIL_FROM = prevFrom;
  });
});
