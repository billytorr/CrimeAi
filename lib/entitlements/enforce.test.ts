import { describe, it, expect, vi, beforeEach } from "vitest";

const can = vi.fn();
const consume = vi.fn();
vi.mock("./service", () => ({ EntitlementService: { can: (...a: any[]) => can(...a), consume: (...a: any[]) => consume(...a) } }));

let flagEnabled = false;
let flagThrows = false;
vi.mock("@/lib/payments/serverdb", () => ({
  serverDb: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
      if (flagThrows) throw new Error("db down");
      return { data: { enabled: flagEnabled } };
    } }) }) }),
  }),
}));

import { enforce, enforceConsume, _resetEnforcementFlagCache } from "./enforce";

beforeEach(() => { can.mockReset(); consume.mockReset(); flagEnabled = false; flagThrows = false; _resetEnforcementFlagCache();
  can.mockResolvedValue({ allowed: true, value: 42 }); consume.mockResolvedValue({ allowed: true, remaining: 3 }); });

describe("enforce — kill switch + cost-path rule", () => {
  it("COST PATH is always enforced, even with the kill switch OFF", async () => {
    flagEnabled = false;
    await enforce("u", "ai_analytical" as any);
    expect(can).toHaveBeenCalledWith("u", "ai_analytical");
  });

  it("COST PATH consume is always enforced with the kill switch OFF (no unbounded spend)", async () => {
    flagEnabled = false;
    await enforceConsume("u", "sms_immediate" as any, 1);
    expect(consume).toHaveBeenCalledWith("u", "sms_immediate", 1);
  });

  it("non-cost capability is NOT gated when the kill switch is OFF", async () => {
    flagEnabled = false;
    const r = await enforce("u", "saved_locations" as any);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("enforcement_off");
    expect(can).not.toHaveBeenCalled();
  });

  it("non-cost capability IS gated when the kill switch is ON", async () => {
    flagEnabled = true;
    await enforce("u", "saved_locations" as any);
    expect(can).toHaveBeenCalledWith("u", "saved_locations");
  });

  it("non-cost metered consume is skipped (allowed) when kill switch OFF", async () => {
    flagEnabled = false;
    const r = await enforceConsume("u", "address_search" as any, 1);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(Infinity);
    expect(consume).not.toHaveBeenCalled();
  });

  it("kill-switch read failure defaults OFF for non-cost (fail-open), but cost paths still enforced", async () => {
    flagThrows = true;
    const nonCost = await enforce("u", "saved_locations" as any);
    expect(nonCost.allowed).toBe(true);
    expect(nonCost.reason).toBe("enforcement_off");
    _resetEnforcementFlagCache();
    flagThrows = true;
    await enforce("u", "ai_analytical" as any); // cost path bypasses the flag
    expect(can).toHaveBeenCalledWith("u", "ai_analytical");
  });
});
