import { describe, it, expect, vi, beforeEach } from "vitest";

// The metro distribution is what the percentile ranks against. If it is ever
// empty, percentileRank returns 0.5 and EVERY area would publish "50" — a
// confident, wrong, public-safety number. These tests lock that door.

let dbResult: { data: any; error: any } = { data: [], error: null };
vi.mock("@/lib/payments/serverdb", () => ({
  serverDb: () => ({ from: () => ({ select: () => ({ eq: async () => dbResult }) }) }),
}));
vi.mock("@/lib/scoring/config", () => ({
  loadScoringConfig: async () => ({
    nss: {
      severityClasses: { disorder: { weight: 3, halflifeDays: 14 } },
      categoryClassMap: { other: "disorder" },
      spatialSigmaMiles: 0.5,
      sourceWeights: { official: 1 },
      sourceKindMap: { open_data: "official" },
      caps: { ugcShareMax: 0.3, singleUserShareMax: 0.05 },
      confidence: { pointDisplayMin: 0.6, populationSaturation: 5000, sourceDiversityTarget: 3 },
      horizonDays: 180,
      coverageFactors: { live: 1, seed: 0.9, synth: 0.4 },
      areaRadiusMiles: 1,
      rangeWidth: { slope: 25, min: 3 },
      version: "nss-test",
    },
  }),
}));

import { computeNSSForPoint, _resetMetroCache } from "@/lib/scoring/point-nss";

const OPTS = { lat: 25.7617, lon: -80.1918, radiusMiles: 1, incidents: [], pool: "seed" as const };

beforeEach(() => { _resetMetroCache(); dbResult = { data: [], error: null }; });

describe("point NSS — metro distribution safety", () => {
  it("THROWS on an empty distribution instead of silently scoring everything 50", async () => {
    dbResult = { data: [], error: null };
    await expect(computeNSSForPoint(OPTS)).rejects.toThrow(/distribution too small/);
  });

  it("THROWS on a single-area distribution (nothing meaningful to rank against)", async () => {
    dbResult = { data: [{ hazard: 1 }], error: null };
    await expect(computeNSSForPoint(OPTS)).rejects.toThrow(/distribution too small/);
  });

  it("THROWS on a DB error rather than guessing", async () => {
    dbResult = { data: null, error: { message: "connection reset" } };
    await expect(computeNSSForPoint(OPTS)).rejects.toThrow(/metro distribution unavailable/);
  });

  it("does NOT cache a failed lookup — the next call retries", async () => {
    dbResult = { data: null, error: { message: "blip" } };
    await expect(computeNSSForPoint(OPTS)).rejects.toThrow();
    dbResult = { data: [{ hazard: 0.1 }, { hazard: 0.5 }, { hazard: 2 }], error: null };
    const ok = await computeNSSForPoint(OPTS);          // same process, no reset
    expect(ok.display).toBeTruthy();
  });

  it("scores against a healthy distribution and reports a range when confidence is low", async () => {
    dbResult = { data: [{ hazard: 0.1 }, { hazard: 0.5 }, { hazard: 2 }], error: null };
    const r = await computeNSSForPoint(OPTS);
    // no incidents → hazard 0 → safest → high score; seed pool + no sources → low confidence → range
    expect(r.isRange).toBe(true);
    expect(r.display).toMatch(/^\d+–\d+$/);
    expect(r.scoreHigh).toBeGreaterThanOrEqual(r.scoreLow);
  });
});
