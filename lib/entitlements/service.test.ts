import { describe, it, expect } from "vitest";
import { effectivePlan, periodStart } from "./service";

const day = 86_400_000;

describe("effectivePlan — grace keeps access (Rule 7), lapse drops to free", () => {
  const now = Date.now();
  it("no subscription → free", () => {
    expect(effectivePlan(null, now)).toBe("free");
  });
  it("active → pro", () => {
    expect(effectivePlan({ plan_id: "pro", status: "active", current_period_start: null, grace_until: null, price_id: "pro_499" }, now)).toBe("pro");
  });
  it("grace → still pro", () => {
    expect(effectivePlan({ plan_id: "pro", status: "grace", current_period_start: null, grace_until: new Date(now + 3 * day).toISOString(), price_id: "pro_499" }, now)).toBe("pro");
  });
  it("past_due WITHIN grace window → still pro", () => {
    expect(effectivePlan({ plan_id: "pro", status: "past_due", current_period_start: null, grace_until: new Date(now + 2 * day).toISOString(), price_id: "pro_499" }, now)).toBe("pro");
  });
  it("past_due AFTER grace expired → free", () => {
    expect(effectivePlan({ plan_id: "pro", status: "past_due", current_period_start: null, grace_until: new Date(now - day).toISOString(), price_id: "pro_499" }, now)).toBe("free");
  });
  it("canceled/expired → free", () => {
    expect(effectivePlan({ plan_id: "pro", status: "canceled", current_period_start: null, grace_until: null, price_id: "pro_499" }, now)).toBe("free");
    expect(effectivePlan({ plan_id: "pro", status: "expired", current_period_start: null, grace_until: null, price_id: "pro_499" }, now)).toBe("free");
  });
});

describe("periodStart — Rule 5 anchoring", () => {
  it("pro uses the subscription's current_period_start", () => {
    const ps = new Date("2026-06-15T00:00:00Z");
    const got = periodStart(
      { plan_id: "pro", status: "active", current_period_start: ps.toISOString(), grace_until: null, price_id: "pro_499" },
      new Date("2020-01-01T00:00:00Z"),
      new Date("2026-07-01T00:00:00Z"),
    );
    expect(got.toISOString()).toBe(ps.toISOString());
  });
  it("free anchors to account creation date, stepping monthly", () => {
    const created = new Date("2026-01-10T00:00:00Z");
    // now = Mar 20 → most recent monthly anniversary is Mar 10
    const got = periodStart(null, created, new Date("2026-03-20T00:00:00Z"));
    expect(got.getUTCMonth()).toBe(2); // March (0-indexed)
    expect(got.getUTCDate()).toBe(10);
  });
  it("free before the first month-day boundary uses the prior anniversary", () => {
    const created = new Date("2026-01-10T00:00:00Z");
    // now = Mar 5 (before the 10th) → boundary is Feb 10
    const got = periodStart(null, created, new Date("2026-03-05T00:00:00Z"));
    expect(got.getUTCMonth()).toBe(1); // February
    expect(got.getUTCDate()).toBe(10);
  });
});
