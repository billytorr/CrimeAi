import { describe, it, expect } from "vitest";
import { decideRegion } from "./regionPolicy";

// PaymentRegionPolicy — the single external-purchase decision point.
// MD quality gate: unit tests covering USA, non-US, and nil storefront.
describe("PaymentRegionPolicy.decideRegion", () => {
  const ALLOWED = ["USA"];

  it("iOS + USA storefront → allowed", () => {
    expect(decideRegion("ios", "USA", ALLOWED)).toBe("allowed");
  });

  it("iOS + non-US storefront → blocked", () => {
    expect(decideRegion("ios", "CAN", ALLOWED)).toBe("blocked");
    expect(decideRegion("ios", "GBR", ALLOWED)).toBe("blocked");
    expect(decideRegion("ios", "DEU", ALLOWED)).toBe("blocked");
  });

  it("iOS + nil/unknown storefront FAILS CLOSED → blocked", () => {
    expect(decideRegion("ios", null, ALLOWED)).toBe("blocked");
    expect(decideRegion("ios", "", ALLOWED)).toBe("blocked");
  });

  it("storefront code is case-insensitive", () => {
    expect(decideRegion("ios", "usa", ALLOWED)).toBe("allowed");
  });

  it("web and android are not App Store storefronts → allowed", () => {
    expect(decideRegion("web", null, ALLOWED)).toBe("allowed");
    expect(decideRegion("android", null, ALLOWED)).toBe("allowed");
  });

  it("expansion is config, not code: adding a storefront to the list allows it", () => {
    expect(decideRegion("ios", "CAN", ["USA", "CAN"])).toBe("allowed");
    expect(decideRegion("ios", "GBR", ["USA", "CAN"])).toBe("blocked");
  });
});
