import { describe, it, expect } from "vitest";
import { validateConfig, type TierConfig } from "./config";
import { ALL_CAPABILITIES } from "./capabilities";

function fullLimits(): Record<string, any> {
  const o: Record<string, any> = {};
  for (const c of ALL_CAPABILITIES) o[c] = 0;
  return o;
}

function goodConfig(): TierConfig {
  return {
    plans: ["free", "pro"],
    prices: [
      { id: "pro_499", planId: "pro", amountCents: 499, currency: "usd", interval: "month", active: true },
      { id: "pro_799", planId: "pro", amountCents: 799, currency: "usd", interval: "month", active: true },
    ],
    limits: { free: fullLimits(), pro: fullLimits() },
  };
}

describe("validateConfig", () => {
  it("accepts a complete config", () => {
    expect(() => validateConfig(goodConfig())).not.toThrow();
  });
  it("supports multiple concurrent active price points (the A/B test)", () => {
    const cfg = goodConfig();
    expect(cfg.prices.filter((p) => p.active).length).toBe(2);
    expect(() => validateConfig(cfg)).not.toThrow();
  });
  it("throws when a plan is missing", () => {
    const cfg = goodConfig(); cfg.plans = ["free"];
    expect(() => validateConfig(cfg)).toThrow(/missing 'pro'/);
  });
  it("throws when a plan is missing a capability", () => {
    const cfg = goodConfig(); delete (cfg.limits.pro as any).ai_analytical;
    expect(() => validateConfig(cfg)).toThrow(/missing capability 'ai_analytical'/);
  });
  it("throws when no price is active", () => {
    const cfg = goodConfig(); cfg.prices.forEach((p) => (p.active = false));
    expect(() => validateConfig(cfg)).toThrow(/no active price/);
  });
  it("throws on a malformed price amount", () => {
    const cfg = goodConfig(); (cfg.prices[0] as any).amountCents = -5;
    expect(() => validateConfig(cfg)).toThrow(/invalid amount/);
  });
});
