import { describe, it, expect } from "vitest";
import { assignPriceArm } from "./pricing";
import type { PriceConfig } from "@/lib/entitlements/config";

const p = (id: string, amt: number): PriceConfig => ({ id, planId: "pro", amountCents: amt, currency: "usd", interval: "month", active: true });
const ARMS = [p("pro_499", 499), p("pro_799", 799)];

describe("assignPriceArm — A/B", () => {
  it("returns the only active price when there's one arm", () => {
    expect(assignPriceArm("u1", [p("pro_499", 499)]).id).toBe("pro_499");
  });
  it("is deterministic per user (same user → same arm every time)", () => {
    const a = assignPriceArm("user-abc", ARMS).id;
    for (let i = 0; i < 20; i++) expect(assignPriceArm("user-abc", ARMS).id).toBe(a);
  });
  it("both arms actually get used across a population", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(assignPriceArm(`user-${i}`, ARMS).id);
    expect(seen.has("pro_499")).toBe(true);
    expect(seen.has("pro_799")).toBe(true);
  });
  it("ignores inactive / non-pro prices", () => {
    const arms = [...ARMS, { ...p("free_x", 0), planId: "free" }, { ...p("pro_dead", 999), active: false }];
    for (let i = 0; i < 50; i++) {
      const got = assignPriceArm(`u-${i}`, arms).id;
      expect(["pro_499", "pro_799"]).toContain(got);
    }
  });
});
