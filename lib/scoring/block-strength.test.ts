import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeBlockStrength, coverage, responsiveness, corroborationRate,
  temporalCoverage, circleDensity, verifiedShare, neighborsToNextTier,
  type BlockStrengthConfig, type BlockStrengthInputs,
} from "./block-strength";

const CFG: BlockStrengthConfig = {
  weights: { coverage: 0.35, responsiveness: 0.20, corroborationRate: 0.15, temporalCoverage: 0.15, circleDensity: 0.10, verifiedShare: 0.05 },
  coverageK: 25,
  responseTargetMinutes: 15,
  verifiedMinLevel: 3,
  tiers: [
    { name: "dark", min: 0 }, { name: "forming", min: 20 }, { name: "watched", min: 40 },
    { name: "protected", min: 60 }, { name: "fortified", min: 80 },
  ],
};

const BASE: BlockStrengthInputs = {
  activeUsers: 40, households: 1000, medianResponseMinutes: 15,
  reportsInWindow: 20, reportsCorroborated: 10,
  hourlyBucketsCovered: 18, usersWithCircle2Plus: 20, usersAtVerifiedLevel: 8,
};

// ── THE INTEGRITY TEST (spec: "the integrity of the whole design") ──
describe("RULE: crime rate is NOT an input to Block Strength", () => {
  const src = readFileSync(join(__dirname, "block-strength.ts"), "utf8");

  it("the module never imports the NSS/hazard computation", () => {
    expect(src).not.toMatch(/from ["']\.\/nss["']/);
    expect(src).not.toMatch(/computeHazard|computeNSS|percentileRank/);
  });
  it("no input field carries incident, crime, hazard, or severity data", () => {
    const inputBlock = src.slice(src.indexOf("interface BlockStrengthInputs"), src.indexOf("export interface BlockStrengthResult"));
    for (const banned of [/\bincident/i, /\bcrime/i, /\bhazard/i, /\bseverity/i, /\bnss\b/i, /safetyScore/i]) {
      expect(inputBlock, `BlockStrengthInputs must not mention ${banned}`).not.toMatch(banned);
    }
    // "reports" appear only as PARTICIPATION counts (corroboration behavior),
    // never as crime volume feeding the score:
    expect(inputBlock).toMatch(/reportsInWindow/);
    expect(inputBlock).toMatch(/reportsCorroborated/);
  });
  it("every explanation asserts crimeRateUsed: false", () => {
    expect(computeBlockStrength(BASE, CFG).explanation.crimeRateUsed).toBe(false);
  });
  it("BEHAVIORAL PROOF: identical watching behavior scores identically regardless of crime volume", () => {
    // Two blocks, same watchers/responsiveness/coverage. One is a hot spot,
    // one is quiet — the score cannot tell, because it never sees crime.
    const quiet = computeBlockStrength({ ...BASE, reportsInWindow: 4, reportsCorroborated: 2 }, CFG);
    const hotspot = computeBlockStrength({ ...BASE, reportsInWindow: 400, reportsCorroborated: 200 }, CFG);
    expect(quiet.score).toBe(hotspot.score); // same 50% corroboration RATE
  });
});

describe("components — hand-calculated", () => {
  it("coverage saturates (10% penetration ≈ excellent)", () => {
    expect(coverage(0, 1000, 25)).toBe(0);
    expect(coverage(100, 1000, 25)).toBeCloseTo(1 - Math.exp(-2.5), 6); // 10% → ~0.918
    expect(coverage(40, 1000, 25)).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(coverage(50, 0, 25)).toBe(0); // no households known
  });
  it("responsiveness: at/under target = 1, decays after", () => {
    expect(responsiveness(15, 15)).toBe(1);
    expect(responsiveness(5, 15)).toBe(1);
    expect(responsiveness(30, 15)).toBe(0.5);
    expect(responsiveness(null, 15)).toBe(0); // no corroborations yet
  });
  it("corroboration rate, temporal coverage, circle density, verified share", () => {
    expect(corroborationRate(10, 20)).toBe(0.5);
    expect(corroborationRate(0, 0)).toBe(0);
    expect(temporalCoverage(18)).toBe(0.75);
    expect(circleDensity(20, 40)).toBe(0.5);
    expect(verifiedShare(8, 40)).toBe(0.2);
  });
  it("weighted assembly matches the spec formula", () => {
    const r = computeBlockStrength(BASE, CFG);
    const expected = 100 * (0.35 * (1 - Math.exp(-1)) + 0.20 * 1 + 0.15 * 0.5 + 0.15 * 0.75 + 0.10 * 0.5 + 0.05 * 0.2);
    expect(r.score).toBeCloseTo(Math.round(expected * 10) / 10, 1);
  });
  it("an empty block scores 0 and lands in the lowest tier", () => {
    const r = computeBlockStrength({ activeUsers: 0, households: 500, medianResponseMinutes: null, reportsInWindow: 0, reportsCorroborated: 0, hourlyBucketsCovered: 0, usersWithCircle2Plus: 0, usersAtVerifiedLevel: 0 }, CFG);
    expect(r.score).toBe(0);
    expect(r.tier).toBe("dark");
  });
});

describe("recruitment loop — the growth mechanic", () => {
  it("reports how many neighbors reach the next tier", () => {
    const thin = { ...BASE, activeUsers: 15, hourlyBucketsCovered: 10, usersWithCircle2Plus: 5, usersAtVerifiedLevel: 2 };
    const r = neighborsToNextTier(thin, CFG);
    expect(r.nextTier).toBeTruthy();
    expect(r.neighborsNeeded).toBeGreaterThan(0);
    // adding exactly that many really does reach the tier
    const after = computeBlockStrength({ ...thin, activeUsers: thin.activeUsers + (r.neighborsNeeded ?? 0) }, CFG);
    expect(after.tier).toBe(r.nextTier);
  });
  it("surfaces the temporal gap (nobody watching 2am–6am)", () => {
    const presence = Array.from({ length: 24 }, (_, h) => !(h >= 2 && h <= 5));
    const r = computeBlockStrength({ ...BASE, hourlyBucketsCovered: 20 }, CFG, presence);
    expect(r.explanation.temporalGapHours).toEqual([2, 3, 4, 5]);
  });
  it("gap hints point at the biggest weighted headroom", () => {
    const noCoverage = { ...BASE, activeUsers: 2 };
    const r = computeBlockStrength(noCoverage, CFG);
    expect(r.explanation.gaps[0].component).toBe("coverage");
  });
});
