// The diagnostic is only useful if it reads provider errors correctly — a
// false "credentials OK" is worse than no test at all. These pin the mapping.

import { describe, it, expect } from "vitest";
import { interpretApns, interpretFcm } from "@/lib/push/diagnose";

describe("interpretApns", () => {
  it("treats BadDeviceToken as a PASS — reaching the token stage means auth succeeded", () => {
    const c = interpretApns("apns 400 {\"reason\":\"BadDeviceToken\"}", false);
    expect(c.ok).toBe(true);
    expect(c.detail).toMatch(/expected pass/i);
  });

  it("treats Unregistered as a pass too", () => {
    expect(interpretApns("apns 410 {\"reason\":\"Unregistered\"}", false).ok).toBe(true);
  });

  it("flags InvalidProviderToken as a key mismatch and names the usual cause", () => {
    const c = interpretApns("apns 403 {\"reason\":\"InvalidProviderToken\"}", false);
    expect(c.ok).toBe(false);
    expect(c.fix).toMatch(/Sign-in-with-Apple key/i);
  });

  it("flags BadTopic against the bundle ID, not the key", () => {
    const c = interpretApns("apns 400 {\"reason\":\"BadTopic\"}", false);
    expect(c.ok).toBe(false);
    expect(c.fix).toMatch(/APNS_BUNDLE_ID/);
  });

  it("flags DeviceTokenNotForTopic as a topic problem", () => {
    expect(interpretApns("apns 400 {\"reason\":\"DeviceTokenNotForTopic\"}", false).fix).toMatch(/BUNDLE_ID/);
  });

  it("calls a 5xx an Apple-side problem, not a config problem", () => {
    const c = interpretApns("apns 503 service unavailable", false);
    expect(c.ok).toBe(false);
    expect(c.fix).toMatch(/not a config problem/i);
  });

  it("reports the dormant state distinctly from a failure", () => {
    expect(interpretApns("apns not configured", false).fix).toMatch(/APNS_KEY_P8/);
  });

  it("never reports failure when the send actually succeeded", () => {
    expect(interpretApns(undefined, true).ok).toBe(true);
  });

  it("does not guess — unknown responses are surfaced verbatim, not passed", () => {
    const c = interpretApns("apns 418 teapot", false);
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("teapot");
  });
});

describe("interpretFcm", () => {
  it("treats an invalid registration token as a PASS", () => {
    const c = interpretFcm('fcm 400 {"error":{"status":"INVALID_ARGUMENT"}}', false);
    expect(c.ok).toBe(true);
    expect(c.detail).toMatch(/expected pass/i);
  });

  it("treats UNREGISTERED as a pass", () => {
    expect(interpretFcm('fcm 404 {"error":{"status":"UNREGISTERED"}}', false).ok).toBe(true);
  });

  it("surfaces the real OAuth error when auth failed", () => {
    const c = interpretFcm("fcm auth failed", false, "google oauth 400 invalid_grant");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("invalid_grant");
    expect(c.fix).toMatch(/private_key/);
  });

  it("distinguishes an authenticated-but-refused send from bad credentials", () => {
    const c = interpretFcm('fcm 403 {"error":{"status":"PERMISSION_DENIED"}}', false);
    expect(c.ok).toBe(false);
    expect(c.fix).toMatch(/Cloud Messaging API/i);
  });

  it("reports dormant distinctly", () => {
    expect(interpretFcm("fcm not configured", false).fix).toMatch(/FCM_SERVICE_ACCOUNT_JSON/);
  });

  it("does not guess on unknown responses", () => {
    expect(interpretFcm("fcm 418 teapot", false).ok).toBe(false);
  });
});
