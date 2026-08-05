import { describe, it, expect } from "vitest";
import { timeDecay, distKernel, percentileRank, computeHazard, computeConfidence, computeNSS, type NssIncidentInput } from "./nss";
import { DEFAULTS, validateScoringConfig, type NssConfig } from "./config";

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const AREA = { lat: 25.7617, lon: -80.1918, areaSqMiles: Math.PI };

// Clean-number config for hand calculation (validated like any config).
const T: NssConfig = {
  severityClasses: { big: { weight: 100, halflifeDays: 100 }, small: { weight: 60, halflifeDays: 100 } },
  categoryClassMap: { violent: "big", other: "small" },
  spatialSigmaMiles: 0.5,
  sourceWeights: { official: 1.0, user_corroborated: 0.45, user_unverified: 0.0 },
  sourceKindMap: { open_data: "official", userrep: "user_corroborated", community: "user_unverified" },
  caps: { ugcShareMax: 0.3, singleUserShareMax: 0.05 },
  confidence: { pointDisplayMin: 0.6, populationSaturation: 5000, sourceDiversityTarget: 3 },
  horizonDays: 180,
  coverageFactors: { live: 1, seed: 0.9, synth: 0.4 },
  version: "nss-test",
};
validateScoringConfig({ nss: T });

const inc = (over: Partial<NssIncidentInput> = {}): NssIncidentInput => ({
  category: "violent", source: "open_data", occurredAt: daysAgo(0),
  lat: AREA.lat, lon: AREA.lon, ...over,
});

describe("f_time — per-class exponential half-life decay", () => {
  it("is 1.0 at Δt=0, 0.5 at one half-life, 0.25 at two", () => {
    expect(timeDecay(0, 120)).toBe(1);
    expect(timeDecay(120 * 86_400_000, 120)).toBeCloseTo(0.5, 10);
    expect(timeDecay(240 * 86_400_000, 120)).toBeCloseTo(0.25, 10);
  });
  it("different classes decay at different rates (spec: shooting vs noise)", () => {
    const dt = 30 * 86_400_000;
    expect(timeDecay(dt, 120)).toBeGreaterThan(timeDecay(dt, 7)); // violent lingers, QoL fades
  });
});

describe("f_dist — Gaussian spatial kernel", () => {
  it("is 1.0 at the center and exp(-1/2) at σ", () => {
    expect(distKernel(0, 0.5)).toBe(1);
    expect(distKernel(0.5, 0.5)).toBeCloseTo(Math.exp(-0.5), 10);
  });
  it("an incident just outside still counts, weakly (3σ ≈ 0.011)", () => {
    expect(distKernel(1.5, 0.5)).toBeCloseTo(Math.exp(-4.5), 10);
    expect(distKernel(1.5, 0.5)).toBeGreaterThan(0);
  });
});

describe("percentile_rank", () => {
  it("mid-rank hand-calc: 2.5 among [1,2,3,4] → 0.5", () => {
    expect(percentileRank(2.5, [1, 2, 3, 4])).toBe(0.5);
  });
  it("ties take half weight; empty distribution → 0.5 neutral", () => {
    expect(percentileRank(2, [1, 2, 3])).toBeCloseTo(0.5, 10);
    expect(percentileRank(9, [])).toBe(0.5);
  });
});

describe("hazard accumulation — hand-calculated fixtures", () => {
  it("single official incident at the spec's seed values: 100×0.5×1×1 / π", () => {
    // DEFAULTS: violent→violent_armed w=100 halflife=120; official weight 1
    const r = computeHazard(
      [{ category: "violent", source: "open_data", occurredAt: daysAgo(120), lat: AREA.lat, lon: AREA.lon }],
      AREA, DEFAULTS.nss, NOW,
    );
    expect(r.hazard).toBeCloseTo(50 / Math.PI, 6);
    expect(r.explanation.contributions[0].timeDecay).toBeCloseTo(0.5, 3);
    expect(r.explanation.contributions[0].severityWeight).toBe(100);
    expect(r.explanation.contributions[0].sourceWeight).toBe(1);
  });

  it("single-source unverified user reports weigh 0.00 (spec source table)", () => {
    const r = computeHazard([inc({ source: "community" })], AREA, T, NOW);
    expect(r.hazard).toBe(0);
    expect(r.explanation.incidentCount).toBe(1);
  });

  it("unknown sources default to least-credible (0 weight), never crash", () => {
    const r = computeHazard([inc({ source: "totally-new-feed" })], AREA, T, NOW);
    expect(r.hazard).toBe(0);
  });

  it("empty data → hazard 0, empty breakdown", () => {
    const r = computeHazard([], AREA, T, NOW);
    expect(r.hazard).toBe(0);
    expect(r.explanation.contributions).toEqual([]);
  });

  it("population normalization divides by population when present, area otherwise", () => {
    const one = [inc()];
    const byArea = computeHazard(one, AREA, T, NOW);
    const byPop = computeHazard(one, { ...AREA, population: 1000 }, T, NOW);
    expect(byArea.explanation.normalization).toEqual({ mode: "area", divisor: Math.round(Math.PI * 1000) / 1000 });
    expect(byPop.explanation.normalization.mode).toBe("population");
    expect(byPop.hazard).toBeCloseTo(100 / 1000, 6);
  });
});

describe("anti-manipulation caps (foundation fixtures; adversarial suite in Phase 5)", () => {
  it("SINGLE-USER CAP: one user's reports clamp to 5% of UGC contribution", () => {
    // user A: 100 signal (dominates), user B: 5 → ugc=105, cap=5.25/user
    const incidents = [
      ...Array.from({ length: 10 }, () => inc({ source: "userrep", userId: "A", category: "other" })), // 10×60×0.45=270... keep simple:
    ];
    // simpler exact fixture: A has one big report, B one small
    const r = computeHazard(
      [
        inc({ source: "userrep", userId: "A" }),                    // 100×1×1×0.45 = 45
        inc({ source: "userrep", userId: "B", category: "other" }), // 60×1×1×0.45 = 27
      ],
      AREA, T, NOW,
    );
    // ugc = 72, maxPerUser = 3.6 → A capped 45→3.6 (−41.4), B capped 27→3.6 (−23.4)
    // cappedUgc = 7.2; no official signal → total = ugc share 100% > 30% cap with 0 official → target 0
    expect(r.explanation.ugc.singleUserCapsApplied).toBe(2);
    expect(r.hazard).toBe(0); // no official signal at all → UGC alone can NEVER set a score
  });

  it("30% UGC CAP: user-generated signal scales down to ≤30% of total", () => {
    const incidents: NssIncidentInput[] = [
      inc(),                                                        // official: 100
      ...Array.from({ length: 25 }, (_, i) => inc({ source: "userrep", userId: `u${i}`, category: "other" })), // 25×27=675 ugc, per-user 27 < 5%×675=33.75 ✓
    ];
    const r = computeHazard(incidents, AREA, T, NOW);
    // target ugc' = 0.3×100/0.7 = 42.857 → total = 142.857 → hazard = total/π
    expect(r.explanation.ugc.cappedShare).toBeCloseTo(0.3, 3);
    expect(r.hazard).toBeCloseTo(142.857 / Math.PI, 2);
  });
});

describe("confidence + score assembly", () => {
  it("computeConfidence multiplies coverage × diversity × population factors", () => {
    const c = computeConfidence({ ...AREA, population: 5000, coverageFactor: 1 }, 3, T);
    expect(c.sourceDiversity).toBe(1);
    expect(c.populationFactor).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(c.value).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it("LOW-CONFIDENCE areas get a RANGE, never a point (spec step 3)", () => {
    const r = computeNSS([], AREA, [1, 2, 3], T, NOW); // no sources → diversity 0 → confidence 0
    expect(r.confidence).toBe(0);
    expect(r.score).toBeNull();
    expect(r.scoreHigh).toBe(100);           // hazard 0 ranks safest
    expect(r.scoreLow).toBe(75);             // 100 − (1−0)×25
  });

  it("high confidence yields a point score from the metro percentile", () => {
    const r = computeNSS(
      [inc(), inc({ source: "userrep", userId: "x" }), inc({ source: "community" })], // 3 source kinds
      { ...AREA, population: 50000, coverageFactor: 1 },
      [1, 5, 1000], // hazard ≈ (100+45)/50000 tiny… rank among [1,5,1000]
      T, NOW,
    );
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
    expect(r.score).not.toBeNull();
    expect(r.score).toBe(Math.round(100 * (1 - r.explanation.percentile.rank)));
  });

  it("every computation carries a full explanation (Rule 10)", () => {
    const r = computeNSS([inc()], AREA, [1], T, NOW);
    const e = r.explanation;
    expect(e.version).toBe("nss-test");
    expect(e.byClass.big).toBeGreaterThan(0);
    expect(e.bySourceKind.official).toBeGreaterThan(0);
    expect(e.normalization.mode).toBe("area");
    expect(e.percentile.metroSampleSize).toBe(1);
    expect(e.contributions[0]).toMatchObject({ class: "big", sourceWeight: 1 });
  });
});
