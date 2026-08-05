import { describe, it, expect } from "vitest";
import { computeHazard, computeNSS, type NssIncidentInput } from "./nss";
import { validateScoringConfig, type NssConfig } from "./config";

// ADVERSARIAL FIXTURES (Phase 5 mandate): simulate coordinated brigading and
// prove the 30% UGC cap and 5% single-user cap hold. These model the real
// attack: making a neighborhood look dangerous (tanking its score) — or
// scrubbing one — via coordinated user reports.

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);
const AREA = { lat: 25.7617, lon: -80.1918, areaSqMiles: Math.PI };

// Corroborated user reports carry real weight (0.45) — the worst case for
// manipulation, since colluding accounts can corroborate each other.
const CFG: NssConfig = {
  severityClasses: { violent: { weight: 100, halflifeDays: 120 }, minor: { weight: 5, halflifeDays: 21 } },
  categoryClassMap: { violent: "violent", other: "minor" },
  spatialSigmaMiles: 0.5,
  sourceWeights: { official: 1.0, user_corroborated: 0.45, user_unverified: 0.0 },
  sourceKindMap: { open_data: "official", userrep: "user_corroborated", community: "user_unverified" },
  caps: { ugcShareMax: 0.3, singleUserShareMax: 0.05 },
  confidence: { pointDisplayMin: 0.6, populationSaturation: 5000, sourceDiversityTarget: 3 },
  horizonDays: 180,
  coverageFactors: { live: 1, seed: 0.9, synth: 0.4 },
  areaRadiusMiles: 1,
  rangeWidth: { slope: 25, min: 3 },
  version: "nss-adversarial-test",
};
validateScoringConfig({ nss: CFG });

const official = (): NssIncidentInput => ({ category: "other", source: "open_data", occurredAt: new Date(NOW).toISOString(), lat: AREA.lat, lon: AREA.lon });
const brigade = (userId: string): NssIncidentInput => ({ category: "violent", source: "userrep", userId, occurredAt: new Date(NOW).toISOString(), lat: AREA.lat, lon: AREA.lon });

describe("ADVERSARIAL: coordinated brigading cannot move the score beyond the caps", () => {
  // Baseline: a quiet block with 10 minor official incidents (signal 50).
  const baseline = Array.from({ length: 10 }, official);

  it("a 100-account ring reporting 'shootings' is capped at 30% of total signal", () => {
    // 100 sockpuppets × 3 corroborated violent reports = 300 × (100×0.45) = 13500 raw UGC
    // vs 50 official. Uncapped, hazard would be ~271× baseline.
    const attack = Array.from({ length: 100 }, (_, u) =>
      Array.from({ length: 3 }, () => brigade(`sock-${u}`)),
    ).flat();
    const clean = computeHazard(baseline, AREA, CFG, NOW);
    const attacked = computeHazard([...baseline, ...attack], AREA, CFG, NOW);

    // Cap math: ugc' = 0.3×official/0.7 → total = official/0.7 → exactly 1/0.7× baseline.
    expect(attacked.hazard / clean.hazard).toBeCloseTo(1 / 0.7, 3);
    expect(attacked.explanation.ugc.cappedShare).toBeCloseTo(0.3, 3);
    // The attack multiplied total signal by at most 1.43× — not 271×.
    expect(attacked.hazard).toBeLessThan(clean.hazard * 1.5);
  });

  it("one motivated user with 500 reports is capped at 5% of UGC contribution", () => {
    // 20 honest corroborated reporters (1 each) + 1 attacker with 500 reports.
    const honest = Array.from({ length: 20 }, (_, u) => brigade(`honest-${u}`));
    const attacker = Array.from({ length: 500 }, () => brigade("attacker"));
    const r = computeHazard([...baseline, ...honest, ...attacker], AREA, CFG, NOW);

    expect(r.explanation.ugc.singleUserCapsApplied).toBeGreaterThanOrEqual(1);
    // With the attacker clamped to 5% of UGC, their 500 reports contribute no
    // more than a small multiple of ONE honest reporter's contribution.
    const honestOnly = computeHazard([...baseline, ...honest], AREA, CFG, NOW);
    const withAttacker = r.hazard;
    // attacker's max possible add = 5% of ugc ≤ ~2 honest units, and the 30%
    // total cap still binds above it:
    expect(withAttacker).toBeLessThanOrEqual(honestOnly.hazard * 1.2);
  });

  it("a brigade with ZERO official signal can never create a hazard at all", () => {
    const attack = Array.from({ length: 200 }, (_, u) => brigade(`sock-${u}`));
    const r = computeHazard(attack, AREA, CFG, NOW);
    // 30% cap with 0 official → target UGC = 0.3×0/0.7 = 0.
    expect(r.hazard).toBe(0);
  });

  it("score impact end-to-end: the attack moves NSS by a bounded amount, not to the floor", () => {
    const metro = [1, 2, 3, 5, 8, 13, 21, 34]; // fixed metro distribution
    const attack = Array.from({ length: 100 }, (_, u) => Array.from({ length: 3 }, () => brigade(`s-${u}`))).flat();
    const clean = computeNSS(baseline, { ...AREA, population: 20000, coverageFactor: 1 }, metro, CFG, NOW);
    const attacked = computeNSS([...baseline, ...attack], { ...AREA, population: 20000, coverageFactor: 1 }, metro, CFG, NOW);
    // hazard rises exactly 1/0.7× → percentile can shift at most a step or two
    const cleanMid = (clean.scoreLow + clean.scoreHigh) / 2;
    const attackedMid = (attacked.scoreLow + attacked.scoreHigh) / 2;
    expect(cleanMid - attackedMid).toBeLessThanOrEqual(15); // bounded, nowhere near a tank-to-zero
  });

  it("unverified (uncorroborated) brigades contribute exactly nothing", () => {
    const attack = Array.from({ length: 500 }, (_, u) => ({ ...brigade(`x-${u}`), source: "community" }));
    const clean = computeHazard(baseline, AREA, CFG, NOW);
    const attacked = computeHazard([...baseline, ...attack], AREA, CFG, NOW);
    expect(attacked.hazard).toBe(clean.hazard);
  });
});
