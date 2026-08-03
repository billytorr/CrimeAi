import { describe, it, expect } from "vitest";
import { decide } from "./decide";
import { CAPABILITIES, ALL_CAPABILITIES, CAP_META } from "./capabilities";

// Config values matching the seeded TIER MATRIX defaults.
const FREE = {
  map_history_days: 7, saved_locations: 1, alert_radius: { dynamic: true, start: 1, cap: 3 },
  address_search: 0, ai_analytical: 5, sms_immediate: 0, channels: ["push"],
  trusted_circle: 3, safety_score_depth: "current",
  protector_badge: false, priority_visibility: false, early_access: false,
} as const;
const PRO = {
  map_history_days: 90, saved_locations: 5, alert_radius: { dynamic: false, max: 10 },
  address_search: 100, ai_analytical: 150, sms_immediate: 100, channels: ["push", "email", "sms"],
  trusted_circle: 15, safety_score_depth: "full",
  protector_badge: true, priority_visibility: true, early_access: true,
} as const;

describe("decide — boolean perks", () => {
  it("FREE has no badge/priority/early-access; PRO has all", () => {
    for (const cap of ["protector_badge", "priority_visibility", "early_access"] as const) {
      expect(decide(cap, (FREE as any)[cap]).allowed).toBe(false);
      expect(decide(cap, (PRO as any)[cap]).allowed).toBe(true);
    }
  });
});

describe("decide — limit caps expose the value for the caller to enforce", () => {
  it("map history window", () => {
    expect(decide(CAPABILITIES.MAP_HISTORY_DAYS, FREE.map_history_days).limit).toBe(7);
    expect(decide(CAPABILITIES.MAP_HISTORY_DAYS, PRO.map_history_days).limit).toBe(90);
  });
  it("saved locations / trusted circle", () => {
    expect(decide(CAPABILITIES.SAVED_LOCATIONS, FREE.saved_locations).limit).toBe(1);
    expect(decide(CAPABILITIES.SAVED_LOCATIONS, PRO.saved_locations).limit).toBe(5);
    expect(decide(CAPABILITIES.TRUSTED_CIRCLE, FREE.trusted_circle).limit).toBe(3);
    expect(decide(CAPABILITIES.TRUSTED_CIRCLE, PRO.trusted_circle).limit).toBe(15);
  });
  it("non-numeric limit values pass through (radius object, channels, depth)", () => {
    expect(decide(CAPABILITIES.ALERT_RADIUS, PRO.alert_radius).value).toEqual({ dynamic: false, max: 10 });
    expect(decide(CAPABILITIES.CHANNELS, FREE.channels).value).toEqual(["push"]);
    expect(decide(CAPABILITIES.SAFETY_SCORE_DEPTH, PRO.safety_score_depth).value).toBe("full");
  });
});

describe("decide — metered caps and boundaries", () => {
  it("FREE address search is blocked at 0", () => {
    expect(decide(CAPABILITIES.ADDRESS_SEARCH, FREE.address_search, 0).allowed).toBe(false);
  });
  it("PRO analytical AI: allowed until the boundary, denied at it", () => {
    expect(decide(CAPABILITIES.AI_ANALYTICAL, PRO.ai_analytical, 0).allowed).toBe(true);
    expect(decide(CAPABILITIES.AI_ANALYTICAL, PRO.ai_analytical, 149).allowed).toBe(true); // room for 1 more
    expect(decide(CAPABILITIES.AI_ANALYTICAL, PRO.ai_analytical, 149).remaining).toBe(1);
    expect(decide(CAPABILITIES.AI_ANALYTICAL, PRO.ai_analytical, 150).allowed).toBe(false); // at cap
    expect(decide(CAPABILITIES.AI_ANALYTICAL, PRO.ai_analytical, 150).reason).toBe("limit_reached");
  });
  it("FREE analytical AI caps at 5", () => {
    expect(decide(CAPABILITIES.AI_ANALYTICAL, FREE.ai_analytical, 4).allowed).toBe(true);
    expect(decide(CAPABILITIES.AI_ANALYTICAL, FREE.ai_analytical, 5).allowed).toBe(false);
  });
  it("unlimited (-1) is always allowed with Infinity remaining", () => {
    const r = decide(CAPABILITIES.ADDRESS_SEARCH, -1, 9_999_999);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(Infinity);
  });
});

describe("decide — completeness", () => {
  it("returns a decision for every capability at both tiers (no gaps)", () => {
    for (const cap of ALL_CAPABILITIES) {
      const f = decide(cap, (FREE as any)[cap], 0);
      const p = decide(cap, (PRO as any)[cap], 0);
      expect(f).toHaveProperty("allowed");
      expect(p).toHaveProperty("allowed");
    }
    // sanity: every capability has metadata
    for (const cap of ALL_CAPABILITIES) expect(CAP_META[cap]).toBeTruthy();
  });
});
