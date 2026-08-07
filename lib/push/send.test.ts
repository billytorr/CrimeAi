import { describe, it, expect, beforeEach, vi } from "vitest";

// Delivery orchestration. Kept in its own file because it MOCKS the APNs
// adapter — that mock must not leak into the adapter's own tests.
// ── delivery orchestration ──────────────────────────────────────────
let profileRow: any = { alert_channels: { push: true } };
let tokenRows: any[] = [];
let dupRow: any = null;
const inserted: any[] = [];
const updated: any[] = [];

vi.mock("@/lib/payments/serverdb", () => ({
  serverDb: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, _v: any) => ({
          maybeSingle: async () => ({ data: table === "profiles" ? profileRow : dupRow }),
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: dupRow }) }) }),
          is: async () => ({ data: tokenRows }),
        }),
      }),
      insert: async (row: any) => { inserted.push(row); return { error: null }; },
      update: (patch: any) => ({ eq: async (_c: string, v: any) => { updated.push({ patch, token: v }); return { error: null }; } }),
    }),
  }),
}));

const apns = vi.fn();
vi.mock("@/lib/push/apns", async (orig) => ({ ...(await orig<any>()), sendApns: (...a: any[]) => apns(...a) }));

describe("sendPush — preferences, dedupe, dead tokens", () => {
  beforeEach(() => {
    profileRow = { alert_channels: { push: true } };
    tokenRows = [{ token: "tok-ios", platform: "ios", environment: "production" }];
    dupRow = null; inserted.length = 0; updated.length = 0;
    apns.mockReset(); apns.mockResolvedValue({ sent: true });
  });

  it("sends to the user's registered devices", async () => {
    const { sendPush } = await import("@/lib/push/send");
    const r = await sendPush("u1", { title: "Alert", body: "Nearby incident", kind: "alert" });
    expect(r.sent).toBe(1);
    expect(apns).toHaveBeenCalledWith("tok-ios", expect.objectContaining({ title: "Alert" }), "production");
  });

  it("respects a user who turned push OFF for routine alerts", async () => {
    profileRow = { alert_channels: { push: false } };
    const { sendPush } = await import("@/lib/push/send");
    const r = await sendPush("u1", { title: "x", body: "y", kind: "alert" });
    expect(r.sent).toBe(0);
    expect(r.skipped).toBe(1);
    expect(apns).not.toHaveBeenCalled();
  });

  it("SAFETY messages bypass the preference — an emergency always reaches the device", async () => {
    profileRow = { alert_channels: { push: false } };
    const { sendPush } = await import("@/lib/push/send");
    const r = await sendPush("u1", { title: "SOS", body: "Trusted contact needs help", kind: "safety" });
    expect(r.sent).toBe(1);
    expect(apns).toHaveBeenCalled();
  });

  it("dedupes: the same event is not delivered twice", async () => {
    dupRow = { id: 1 };
    const { sendPush } = await import("@/lib/push/send");
    const r = await sendPush("u1", { title: "x", body: "y", kind: "alert", dedupeKey: "incident-42" });
    expect(r.sent).toBe(0);
    expect(r.skipped).toBe(1);
    expect(apns).not.toHaveBeenCalled();
  });

  it("disables a token the provider reports dead", async () => {
    apns.mockResolvedValue({ sent: false, error: "apns 410", deadToken: true });
    const { sendPush } = await import("@/lib/push/send");
    const r = await sendPush("u1", { title: "x", body: "y", kind: "alert" });
    expect(r.failed).toBe(1);
    expect(r.disabled).toBe(1);
    expect(updated[0].patch.disabled_at).toBeTruthy();
  });

  it("a user with no devices is skipped, not failed", async () => {
    tokenRows = [];
    const { sendPush } = await import("@/lib/push/send");
    const r = await sendPush("u1", { title: "x", body: "y", kind: "alert" });
    expect(r.attempted).toBe(0);
    expect(r.skipped).toBe(1);
  });

  it("every attempt is logged for debugging", async () => {
    const { sendPush } = await import("@/lib/push/send");
    await sendPush("u1", { title: "x", body: "y", kind: "alert" });
    expect(inserted.length).toBe(1);
    expect(inserted[0]).toMatchObject({ user_id: "u1", kind: "alert", status: "sent" });
  });
});

// ── Rule 1: the push path carries no tier/score/identity checks ──────
describe("Rule 1 — push delivery is free of entitlement and scoring checks", () => {
  it("no send-path file references tier, score, entitlement or identity", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const f of ["send.ts", "apns.ts", "fcm.ts"]) {
      const src = readFileSync(join(__dirname, f), "utf8");
      const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
      for (const rx of [/@\/lib\/entitlements/, /EntitlementService/, /tier_/, /guardian/i, /identity_status/, /@\/lib\/scoring/]) {
        expect(code, `lib/push/${f} must not match ${rx}`).not.toMatch(rx);
      }
    }
  });
});

// The environment trap: a debug Xcode build gets a SANDBOX APNs token, a
// TestFlight build gets a PRODUCTION one, and JS cannot tell which build it
// is in. Apple rejects a cross-environment token with the same BadDeviceToken
// it uses for a genuinely dead one — so without a retry, every debug device
// is disabled on its first push and never recovers.
describe("sendPush — APNs environment self-correction", () => {
  beforeEach(() => {
    profileRow = { alert_channels: { push: true } };
    tokenRows = [{ token: "tok-ios", platform: "ios", environment: "production" }];
    dupRow = null; inserted.length = 0; updated.length = 0;
    apns.mockReset();
  });

  it("retries the other environment when the token looks dead, and counts it sent", async () => {
    apns.mockResolvedValueOnce({ sent: false, error: "apns 400 BadDeviceToken", deadToken: true })
        .mockResolvedValueOnce({ sent: true });
    const { sendPush } = await import("@/lib/push/send");
    const r = await sendPush("u1", { title: "t", body: "b", kind: "alert" });

    expect(apns).toHaveBeenCalledTimes(2);
    expect(apns.mock.calls[0][2]).toBe("production");
    expect(apns.mock.calls[1][2]).toBe("sandbox");   // tried the other host
    expect(r.sent).toBe(1);
    expect(r.disabled).toBe(0);                       // must NOT be disabled
  });

  it("persists the corrected environment so the next send is right first time", async () => {
    apns.mockResolvedValueOnce({ sent: false, error: "apns 400 BadDeviceToken", deadToken: true })
        .mockResolvedValueOnce({ sent: true });
    const { sendPush } = await import("@/lib/push/send");
    await sendPush("u1", { title: "t", body: "b", kind: "alert" });

    expect(updated).toContainEqual({ patch: { environment: "sandbox" }, token: "tok-ios" });
  });

  it("still disables a token that fails on BOTH environments", async () => {
    apns.mockResolvedValue({ sent: false, error: "apns 410 Unregistered", deadToken: true });
    const { sendPush } = await import("@/lib/push/send");
    const r = await sendPush("u1", { title: "t", body: "b", kind: "alert" });

    expect(apns).toHaveBeenCalledTimes(2);
    expect(r.disabled).toBe(1);
    expect(r.failed).toBe(1);
  });

  it("does not retry a failure that is not a token problem", async () => {
    apns.mockResolvedValue({ sent: false, error: "apns 403 InvalidProviderToken" });
    const { sendPush } = await import("@/lib/push/send");
    await sendPush("u1", { title: "t", body: "b", kind: "alert" });

    expect(apns).toHaveBeenCalledTimes(1);   // a bad key is not fixed by another host
  });

  it("starts from sandbox and corrects to production when that is the mismatch", async () => {
    tokenRows = [{ token: "tok-ios", platform: "ios", environment: "sandbox" }];
    apns.mockResolvedValueOnce({ sent: false, error: "apns 400 BadDeviceToken", deadToken: true })
        .mockResolvedValueOnce({ sent: true });
    const { sendPush } = await import("@/lib/push/send");
    await sendPush("u1", { title: "t", body: "b", kind: "alert" });

    expect(apns.mock.calls[1][2]).toBe("production");
    expect(updated).toContainEqual({ patch: { environment: "production" }, token: "tok-ios" });
  });
});
