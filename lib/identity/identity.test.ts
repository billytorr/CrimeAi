import { describe, it, expect } from "vitest";
import { computeLevel, vendorExpiry } from "./levels";
import { detectReportRings, intervalEntropy, type CorroborationEdge } from "./antiabuse";
import { checkGeoConsistency } from "./geo-consistency";

const NOW = Date.UTC(2026, 7, 5);

describe("identity levels — every transition", () => {
  const base = { emailVerified: false, phoneVerified: false, deviceAttested: false, geoConsistent: false };

  it("L0: account only; email alone is still L0 (L1 needs phone too)", () => {
    expect(computeLevel(base)).toBe(0);
    expect(computeLevel({ ...base, emailVerified: true })).toBe(0);
    expect(computeLevel({ ...base, phoneVerified: true })).toBe(0);
  });
  it("L1: email + phone", () => {
    expect(computeLevel({ ...base, emailVerified: true, phoneVerified: true })).toBe(1);
  });
  it("L2: L1 + attestation + geo (either alone is not enough)", () => {
    const l1 = { ...base, emailVerified: true, phoneVerified: true };
    expect(computeLevel({ ...l1, deviceAttested: true })).toBe(1);
    expect(computeLevel({ ...l1, geoConsistent: true })).toBe(1);
    expect(computeLevel({ ...l1, deviceAttested: true, geoConsistent: true })).toBe(2);
  });
  it("L3/L4: vendor pass on top of L2; failed vendor stays L2", () => {
    const l2 = { ...base, emailVerified: true, phoneVerified: true, deviceAttested: true, geoConsistent: true };
    expect(computeLevel({ ...l2, vendorPassed: true, vendorLevel: 3 as const })).toBe(3);
    expect(computeLevel({ ...l2, vendorPassed: true, vendorLevel: 4 as const })).toBe(4);
    expect(computeLevel({ ...l2, vendorPassed: false, vendorLevel: 4 as const })).toBe(2);
  });
  it("EXPIRY: an expired L3/L4 drops back to L2 (annual re-verification)", () => {
    const l2 = { ...base, emailVerified: true, phoneVerified: true, deviceAttested: true, geoConsistent: true };
    const expired = new Date(NOW - 86_400_000).toISOString();
    const valid = new Date(NOW + 86_400_000).toISOString();
    expect(computeLevel({ ...l2, vendorPassed: true, vendorLevel: 4 as const, vendorExpiresAt: expired }, NOW)).toBe(2);
    expect(computeLevel({ ...l2, vendorPassed: true, vendorLevel: 4 as const, vendorExpiresAt: valid }, NOW)).toBe(4);
  });
  it("losing a lower factor drops the level even with a vendor pass (no floor)", () => {
    expect(computeLevel({ ...base, emailVerified: true, phoneVerified: false, deviceAttested: true, geoConsistent: true, vendorPassed: true, vendorLevel: 4 as const })).toBe(0);
  });
  it("vendorExpiry is one year out", () => {
    expect(vendorExpiry(NOW)).toBe(new Date(NOW + 365 * 86_400_000).toISOString());
  });
});

describe("report-ring detection — collusion fixture (spec Layer 5 rule 7)", () => {
  // Ring: A, B, C corroborate ONLY each other, heavily.
  const ring: CorroborationEdge[] = [
    { from: "A", to: "B", count: 5 }, { from: "B", to: "A", count: 4 },
    { from: "B", to: "C", count: 6 }, { from: "C", to: "B", count: 5 },
    { from: "A", to: "C", count: 3 }, { from: "C", to: "A", count: 4 },
  ];
  // Organic users: corroborate many different people, few mutual pairs.
  const organic: CorroborationEdge[] = [
    { from: "u1", to: "u2", count: 1 }, { from: "u1", to: "u3", count: 2 },
    { from: "u2", to: "u4", count: 1 }, { from: "u3", to: "u5", count: 1 },
    { from: "u4", to: "u1", count: 1 }, { from: "u5", to: "u6", count: 2 },
  ];

  it("flags the A-B-C collusion cluster", () => {
    const flags = detectReportRings([...ring, ...organic]);
    expect(flags.length).toBe(1);
    expect(flags[0].members).toEqual(["A", "B", "C"]);
    expect(flags[0].internalShare).toBeGreaterThanOrEqual(0.8);
    expect(flags[0].totalCorroborations).toBe(27);
  });
  it("does NOT flag organic corroboration patterns", () => {
    expect(detectReportRings(organic)).toEqual([]);
  });
  it("a ring that ALSO corroborates outsiders below the share threshold escapes — until the share rises", () => {
    const mixed = [...ring, { from: "A", to: "z1", count: 10 }, { from: "B", to: "z2", count: 10 }];
    expect(detectReportRings(mixed)).toEqual([]); // internal share diluted to ~0.57
    expect(detectReportRings(mixed, { internalShareMin: 0.5 }).length).toBe(1); // tunable
  });
});

describe("behavioral entropy — bots are metronomic", () => {
  it("perfectly regular intervals are suspicious", () => {
    const t0 = NOW;
    const bot = Array.from({ length: 20 }, (_, i) => t0 + i * 3_600_000); // exactly hourly
    const r = intervalEntropy(bot);
    expect(r.suspicious).toBe(true);
    expect(r.score).toBeLessThan(0.15);
  });
  it("human-jittered intervals are not suspicious", () => {
    let t = NOW;
    const human: number[] = [t];
    const jitter = [0.4, 2.1, 0.7, 5.3, 1.2, 0.1, 3.8, 0.9, 2.6, 7.7, 0.3, 1.9];
    for (const j of jitter) { t += j * 3_600_000; human.push(t); }
    expect(intervalEntropy(human).suspicious).toBe(false);
  });
  it("too few samples never judge", () => {
    expect(intervalEntropy([NOW, NOW + 1000]).suspicious).toBe(false);
  });
});

describe("geo consistency — signal only, always fail-open", () => {
  it("nearby ip and claimed location are consistent", () => {
    const r = checkGeoConsistency({ lat: 25.76, lon: -80.19 }, { lat: 25.9, lon: -80.3 });
    expect(r.consistent).toBe(true);
  });
  it("cross-country mismatch is inconsistent (signal, not block)", () => {
    const r = checkGeoConsistency({ lat: 25.76, lon: -80.19 }, { lat: 47.6, lon: -122.3 });
    expect(r.consistent).toBe(false);
    expect(r.distanceMiles).toBeGreaterThan(2000);
  });
  it("missing ip geolocation is inconclusive → consistent (fail-open)", () => {
    expect(checkGeoConsistency({ lat: 25.76, lon: -80.19 }, null).consistent).toBe(true);
  });
});
