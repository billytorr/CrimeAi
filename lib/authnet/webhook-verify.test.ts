import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "./webhook-verify";

const KEY = "0123456789ABCDEF0123456789ABCDEF";
const body = JSON.stringify({ notificationId: "abc", eventType: "net.authorize.customer.subscription.created" });
const sig = (b: string, k: string) => createHmac("sha512", k).update(b, "utf8").digest("hex");

describe("webhook signature verification", () => {
  it("accepts a correct sha512= signature", () => {
    expect(verifyWebhookSignature(body, `sha512=${sig(body, KEY).toUpperCase()}`, KEY)).toBe(true);
  });
  it("accepts lowercase hex too", () => {
    expect(verifyWebhookSignature(body, `sha512=${sig(body, KEY)}`, KEY)).toBe(true);
  });
  it("rejects a signature made with the WRONG key (forgery)", () => {
    expect(verifyWebhookSignature(body, `sha512=${sig(body, "wrong-key")}`, KEY)).toBe(false);
  });
  it("rejects when the body was tampered", () => {
    const s = `sha512=${sig(body, KEY)}`;
    expect(verifyWebhookSignature(body + " ", s, KEY)).toBe(false);
  });
  it("rejects a MISSING signature header", () => {
    expect(verifyWebhookSignature(body, null, KEY)).toBe(false);
    expect(verifyWebhookSignature(body, "", KEY)).toBe(false);
  });
  it("rejects when no signature key is configured", () => {
    expect(verifyWebhookSignature(body, `sha512=${sig(body, KEY)}`, "")).toBe(false);
  });
});
