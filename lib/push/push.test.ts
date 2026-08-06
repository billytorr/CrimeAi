import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ENV = ["APNS_KEY_P8", "APNS_KEY_ID", "APNS_TEAM_ID", "APNS_BUNDLE_ID", "FCM_SERVICE_ACCOUNT_JSON"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("APNs adapter — dormant-safe", () => {
  it("no-ops without credentials (never throws, never fetches)", async () => {
    const { sendApns, apnsConfigured } = await import("@/lib/push/apns");
    expect(apnsConfigured()).toBe(false);
    const r = await sendApns("tok", { title: "t", body: "b" });
    expect(r.sent).toBe(false);
    expect(r.skipped).toMatch(/not configured/);
  });

  it("signs a well-formed ES256 JWT from a real P-256 key", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    process.env.APNS_KEY_P8 = privateKey as unknown as string;
    process.env.APNS_KEY_ID = "ABC123"; process.env.APNS_TEAM_ID = "TEAM99"; process.env.APNS_BUNDLE_ID = "com.pscc.crimeai";
    const { buildApnsJwt, _resetApnsJwt, apnsConfigured } = await import("@/lib/push/apns");
    _resetApnsJwt();
    expect(apnsConfigured()).toBe(true);
    const jwt = buildApnsJwt();
    const [h, p, s] = jwt.split(".");
    expect(jwt.split(".").length).toBe(3);
    const header = JSON.parse(Buffer.from(h, "base64").toString());
    const payload = JSON.parse(Buffer.from(p, "base64").toString());
    expect(header).toMatchObject({ alg: "ES256", kid: "ABC123" });
    expect(payload.iss).toBe("TEAM99");
    expect(typeof payload.iat).toBe("number");
    // ieee-p1363 signature is a fixed 64 bytes for P-256
    expect(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").length).toBe(64);
  });

  it("caches the JWT (Apple rejects regenerating it per request)", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    process.env.APNS_KEY_P8 = privateKey as unknown as string;
    process.env.APNS_KEY_ID = "K"; process.env.APNS_TEAM_ID = "T"; process.env.APNS_BUNDLE_ID = "b";
    const { buildApnsJwt, _resetApnsJwt } = await import("@/lib/push/apns");
    _resetApnsJwt();
    expect(buildApnsJwt()).toBe(buildApnsJwt());
  });

  it("accepts \\n-escaped keys (env vars cannot hold real newlines)", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    process.env.APNS_KEY_P8 = String(privateKey).replace(/\n/g, "\\n");
    process.env.APNS_KEY_ID = "K"; process.env.APNS_TEAM_ID = "T"; process.env.APNS_BUNDLE_ID = "b";
    const { buildApnsJwt, _resetApnsJwt } = await import("@/lib/push/apns");
    _resetApnsJwt();
    expect(() => buildApnsJwt()).not.toThrow();
  });
});

describe("FCM adapter — dormant-safe", () => {
  it("no-ops without a service account", async () => {
    const { sendFcm, fcmConfigured } = await import("@/lib/push/fcm");
    expect(fcmConfigured()).toBe(false);
    const r = await sendFcm("tok", { title: "t", body: "b" });
    expect(r.sent).toBe(false);
    expect(r.skipped).toMatch(/not configured/);
  });
  it("treats malformed service-account JSON as unconfigured rather than crashing", async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = "{not json";
    const { sendFcm } = await import("@/lib/push/fcm");
    const r = await sendFcm("tok", { title: "t", body: "b" });
    expect(r.sent).toBe(false);
    expect(r.skipped).toMatch(/not configured/);
  });
});
