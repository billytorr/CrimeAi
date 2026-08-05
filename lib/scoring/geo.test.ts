import { describe, it, expect } from "vitest";
import { geohashEncode, geohashCenter, milesApart } from "./geo";

describe("geohash", () => {
  it("matches the canonical published vector (57.64911,10.40744 → u4pruy…)", () => {
    expect(geohashEncode(57.64911, 10.40744, 6)).toBe("u4pruy");
    expect(geohashEncode(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
  });
  it("Miami downtown encodes stably at precision 6", () => {
    const h = geohashEncode(25.7617, -80.1918, 6);
    expect(h).toHaveLength(6);
    // decode round-trip lands inside the same cell
    const c = geohashCenter(h);
    expect(geohashEncode(c.lat, c.lon, 6)).toBe(h);
    expect(milesApart(25.7617, -80.1918, c.lat, c.lon)).toBeLessThan(0.6); // ~cell radius
  });
  it("rejects invalid geohash characters", () => {
    expect(() => geohashCenter("abc!")).toThrow(/invalid geohash/);
  });
});

describe("milesApart (haversine)", () => {
  it("zero distance at identical points", () => {
    expect(milesApart(25.76, -80.19, 25.76, -80.19)).toBe(0);
  });
  it("known pair: Miami downtown → Wynwood ≈ 2.8mi (sanity band)", () => {
    const d = milesApart(25.7617, -80.1918, 25.801, -80.1994);
    expect(d).toBeGreaterThan(2.2);
    expect(d).toBeLessThan(3.2);
  });
});
