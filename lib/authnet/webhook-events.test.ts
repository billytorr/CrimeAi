import { describe, it, expect } from "vitest";
import { decideSubscriptionEvent, graceUntil, graceDaysFromEnv, ANET_EVENTS } from "./webhook-events";

const T0 = Date.UTC(2026, 7, 4, 12, 0, 0); // fixed clock

describe("decideSubscriptionEvent", () => {
  it("suspended → past_due with a grace window + payment_failed email", () => {
    const d = decideSubscriptionEvent(ANET_EVENTS.SUSPENDED, T0, 7);
    expect(d.action).toBe("suspend");
    expect(d.update.status).toBe("past_due");
    expect(d.update.grace_until).toBe(new Date(T0 + 7 * 86400000).toISOString());
    expect(d.email).toBe("payment_failed");
  });

  it("terminated and cancelled → canceled (grace cleared) + canceled email", () => {
    for (const ev of [ANET_EVENTS.TERMINATED, ANET_EVENTS.CANCELLED]) {
      const d = decideSubscriptionEvent(ev, T0, 7);
      expect(d.update).toEqual({ status: "canceled", grace_until: null });
      expect(d.email).toBe("canceled");
    }
  });

  it("expired → expired, no email", () => {
    const d = decideSubscriptionEvent(ANET_EVENTS.EXPIRED, T0, 7);
    expect(d.update).toEqual({ status: "expired", grace_until: null });
    expect(d.email).toBeNull();
  });

  it("expiring / created / payment events / unknown → noop (never touch status)", () => {
    for (const ev of [ANET_EVENTS.EXPIRING, "net.authorize.customer.subscription.created", ANET_EVENTS.AUTHCAPTURE, "garbage"]) {
      const d = decideSubscriptionEvent(ev, T0, 7);
      expect(d.action).toBe("noop");
      expect(d.update).toEqual({});
      expect(d.email).toBeNull();
    }
  });

  it("grace window honors the configured number of days", () => {
    const d = decideSubscriptionEvent(ANET_EVENTS.SUSPENDED, T0, 3);
    expect(d.update.grace_until).toBe(new Date(T0 + 3 * 86400000).toISOString());
  });
});

describe("graceUntil", () => {
  it("adds N days in UTC", () => {
    expect(graceUntil(T0, 7)).toBe(new Date(T0 + 7 * 86400000).toISOString());
  });
  it("never goes negative", () => {
    expect(graceUntil(T0, -5)).toBe(new Date(T0).toISOString());
  });
});

describe("graceDaysFromEnv", () => {
  it("defaults to 7 (Rule 7)", () => {
    const prev = process.env.TIER_GRACE_DAYS; delete process.env.TIER_GRACE_DAYS;
    expect(graceDaysFromEnv()).toBe(7);
    if (prev !== undefined) process.env.TIER_GRACE_DAYS = prev;
  });
  it("respects a valid override", () => {
    const prev = process.env.TIER_GRACE_DAYS; process.env.TIER_GRACE_DAYS = "14";
    expect(graceDaysFromEnv()).toBe(14);
    if (prev === undefined) delete process.env.TIER_GRACE_DAYS; else process.env.TIER_GRACE_DAYS = prev;
  });
});
