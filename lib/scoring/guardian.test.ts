import { describe, it, expect } from "vitest";
import {
  reportValue, corroborationValue, conversationValue, streakValue,
  accuracyFactor, identityMultiplier, penaltyValue, decayFactor, penaltyDecayFactor,
  computeGuardianScore, tierOf, flipGrantMonths, stackedPeriodEnd,
  type GuardianConfig,
} from "./guardian";

// Mirror of the SQL seed (gs.* keys) — hand-calculation config.
const CFG: GuardianConfig = {
  reportBase: {
    violent_armed: 40, violent_unarmed: 30, sexual_offense: 35,
    burglary_residential: 20, burglary_commercial: 15,
    motor_vehicle_theft: 15, theft_from_vehicle: 12, larceny_other: 10,
    vandalism: 8, disorder: 5, quality_of_life: 3, suspicious_person: 0,
  },
  zeroPointClasses: ["suspicious_person"],
  corroborationMultiplier: 1.5,
  earliness: { maxBonus: 0.5, windowMinutes: 60 },
  novelty: { first: 1.0, floor: 0.2, decayPerDuplicate: 0.2 },
  conversation: { perNetUpvote: 1, dailyCap: 10, diminishingAfter: 5 },
  streak: { perDay: 2, cap: 60, forgiveMissedDays: 1 },
  accuracyPrior: { alpha: 2, beta: 2, clampMin: 0.1, clampMax: 1.0 },
  identityMultipliers: { "0": 0.25, "1": 0.5, "2": 0.75, "3": 1.0, "4": 1.25 },
  penalties: { falseReportMultiplier: 3, retractionMultiplier: 0.5, flagUpheld: 50, penaltyDecayRateFactor: 0.5 },
  decay: { halflifeDays: 90, floor: 0.6 },
  dailyCaps: { reportEvents: 10, corroborationEvents: 15, contextEvents: 10 },
  vestingWindowHours: 72,
  tiers: [
    { name: "neighbor", min: 0, identityLevel: 0 },
    { name: "watcher", min: 100, identityLevel: 1 },
    { name: "guardian", min: 300, identityLevel: 2 },
    { name: "sentinel", min: 600, identityLevel: 3 },
    { name: "captain", min: 900, identityLevel: 4, manualApproval: true },
  ],
  flipGrants: { guardian: 1, sentinel: 3, captain: 12, captainRenewing: true },
  watchPointsPerGs: 1,
};

describe("THE PROOF: accuracy is a MULTIPLIER — volume without accuracy earns nothing", () => {
  it("high volume × terrible accuracy ≈ zero; modest volume × great accuracy wins", () => {
    // Spammer: huge contribution, 5 verified / 95 rejected
    const spammer = computeGuardianScore(
      { contributionValue: 2000, agedPenalties: 0, verified: 5, rejected: 95, identityLevel: 2, daysInactive: 0 }, CFG);
    // accuracy = (5+2)/(5+95+4) = 7/104 ≈ 0.067 → clamped 0.1 → 2000×0.1×0.75 = 150
    expect(spammer.explanation.accuracyFactor).toBe(0.1);
    expect(spammer.score).toBe(150);

    // Careful contributor: 10× less volume, 30 verified / 1 rejected
    const careful = computeGuardianScore(
      { contributionValue: 200, agedPenalties: 0, verified: 30, rejected: 1, identityLevel: 2, daysInactive: 0 }, CFG);
    // accuracy = 32/35 ≈ 0.914 → 200×0.914×0.75 ≈ 137 — a tenth the volume, nearly equal score
    expect(careful.score).toBeGreaterThan(spammer.score * 0.85);
    // and at equal volume the careful user hits the 1000 ceiling while the
    // spammer sits at 150 (unclamped ratio would be 0.914/0.1 ≈ 9.1×):
    const carefulSameVolume = computeGuardianScore(
      { contributionValue: 2000, agedPenalties: 0, verified: 30, rejected: 1, identityLevel: 2, daysInactive: 0 }, CFG);
    expect(carefulSameVolume.score).toBe(1000);
    expect(carefulSameVolume.score / spammer.score).toBeGreaterThan(6);
  });
});

describe("earning valuations — hand-calculated", () => {
  it("reportValue = base × earliness × novelty", () => {
    // violent_armed base 40, 30min ahead → 1+0.5×(30/60)... earliness = 1+min(0.5,30/60)=1.5? min(0.5, 0.5)=0.5 → 1.5
    expect(reportValue("violent_armed", 30, 0, CFG)).toBe(40 * 1.5 * 1.0);
    // no earliness, 3rd duplicate: novelty 1.0−3×0.2 = 0.4
    expect(reportValue("burglary_residential", 0, 3, CFG)).toBe(20 * 1 * 0.4);
    // novelty floors at 0.2 (5th+ duplicate)
    expect(reportValue("burglary_residential", 0, 9, CFG)).toBe(20 * 1 * 0.2);
    // earliness bonus caps at +50% no matter how early
    expect(reportValue("disorder", 600, 0, CFG)).toBe(5 * 1.5);
  });

  it("ZERO POINTS for suspicious-person — hard rule, regardless of bonuses", () => {
    expect(reportValue("suspicious_person", 600, 0, CFG)).toBe(0);
    expect(corroborationValue("suspicious_person", CFG)).toBe(0);
  });

  it("corroboration ≈ 1.5× the per-unit posting value", () => {
    expect(corroborationValue("theft_from_vehicle", CFG)).toBe(12 * 1.5);
  });

  it("conversation: diminishing after 5, hard cap 10, never raw count", () => {
    expect(conversationValue(3, CFG)).toBe(3);
    expect(conversationValue(9, CFG)).toBe(5 + 4 * 0.5);   // 7
    expect(conversationValue(100, CFG)).toBe(10);          // cap
    expect(conversationValue(-5, CFG)).toBe(0);
  });

  it("streak: capped", () => {
    expect(streakValue(10, CFG)).toBe(20);
    expect(streakValue(500, CFG)).toBe(60);
  });
});

describe("multipliers, penalties, decay", () => {
  it("accuracy prior: new user with 1 verified is NOT at 100%", () => {
    expect(accuracyFactor(1, 0, CFG)).toBe(0.6);  // (1+2)/(1+0+4)
    expect(accuracyFactor(0, 0, CFG)).toBe(0.5);  // pure prior
    expect(accuracyFactor(0, 50, CFG)).toBe(0.1); // clamp floor
  });
  it("identity multipliers L0–L4 per spec", () => {
    expect([0, 1, 2, 3, 4].map((l) => identityMultiplier(l, CFG))).toEqual([0.25, 0.5, 0.75, 1.0, 1.25]);
  });
  it("penalties: −3× base false report, −0.5× retraction, −50 flag", () => {
    expect(penaltyValue("false_report", "violent_armed", CFG)).toBe(120);
    expect(penaltyValue("retraction", "violent_armed", CFG)).toBe(20);
    expect(penaltyValue("flag_upheld", null, CFG)).toBe(50);
  });
  it("decay floors at 0.6 — long contributors are dimmed, never erased", () => {
    expect(decayFactor(0, CFG)).toBe(1);
    expect(decayFactor(90, CFG)).toBeCloseTo(0.6, 5); // 2^-1 = 0.5 → floored 0.6
    expect(decayFactor(3650, CFG)).toBe(0.6);
  });
  it("penalties decay at HALF the earn rate (double half-life, no floor)", () => {
    expect(penaltyDecayFactor(180, CFG)).toBeCloseTo(0.5, 5);  // halflife 180 = 90/0.5
    expect(penaltyDecayFactor(90, CFG)).toBeCloseTo(Math.pow(2, -0.5), 5);
  });
});

describe("tiers — score AND identity requirements", () => {
  it("score without identity caps the tier", () => {
    expect(tierOf(350, 0, CFG)).toBe("neighbor");  // guardian needs L2, watcher needs L1
    expect(tierOf(350, 1, CFG)).toBe("watcher");
    expect(tierOf(350, 2, CFG)).toBe("guardian");
  });
  it("captain requires L4 AND manual approval — never automatic", () => {
    expect(tierOf(950, 4, CFG)).toBe("sentinel");          // approval missing
    expect(tierOf(950, 4, CFG, true)).toBe("captain");
    expect(tierOf(950, 3, CFG, true)).toBe("sentinel");    // identity missing
  });
});

describe("FARMING FIXTURE: caps + novelty + accuracy make farming worthless", () => {
  it("100 duplicate reports of the same incident in a day earn a bounded trickle", () => {
    // duplicates 0..99 of a burglary: novelty floors at 0.2 after the 4th
    let total = 0;
    for (let i = 0; i < 100; i++) total += reportValue("burglary_residential", 0, i, CFG);
    // first five: 20×(1.0+0.8+0.6+0.4+0.2)=60; remaining 95×4=380 → 440 raw
    expect(total).toBe(440);
    // daily cap on report EVENTS (10/day) bounds what even enters the ledger:
    // i0..9 novelty: 1.0,.8,.6,.4,.2,.2,.2,.2,.2,.2 → 20+16+12+8+4+(5×4) = 80
    let capped = 0;
    for (let i = 0; i < Math.min(100, CFG.dailyCaps.reportEvents); i++) capped += reportValue("burglary_residential", 0, i, CFG);
    expect(capped).toBe(80);
  });

  it("DUPLICATE-ACCOUNT FIXTURE: the penalty resets everything — accuracy can't save it", () => {
    // A farm of accounts is detected: penalty_duplicate_account zeroes the
    // ledger contribution (service resets); even a pre-reset snapshot with the
    // penalty applied at full weight goes to 0.
    const preReset = computeGuardianScore(
      { contributionValue: 500, agedPenalties: 500 * 1.0 * 1.25, verified: 50, rejected: 0, identityLevel: 4, daysInactive: 0 }, CFG);
    expect(preReset.score).toBe(0); // (500×~0.96×1.25 − 625) ≤ 0 → clamped 0
  });
});

describe("PHASE 8: the Protector flip", () => {
  it("promotion grants per spec: guardian 1, sentinel 3, captain 12", () => {
    expect(flipGrantMonths("neighbor", "guardian", CFG)).toBe(1);
    expect(flipGrantMonths("watcher", "sentinel", CFG)).toBe(3);
    expect(flipGrantMonths("sentinel", "captain", CFG)).toBe(12);
  });
  it("no grant on demotion or sideways", () => {
    expect(flipGrantMonths("captain", "sentinel", CFG)).toBe(0);
    expect(flipGrantMonths("guardian", "guardian", CFG)).toBe(0);
  });
  it("skipping tiers grants the NEW tier's amount once", () => {
    expect(flipGrantMonths("neighbor", "sentinel", CFG)).toBe(3);
  });
  it("STACKING: grant extends an active (paid or comped) period; starts fresh otherwise", () => {
    const now = Date.UTC(2026, 7, 5);
    const activeUntil = new Date(Date.UTC(2026, 8, 1)).toISOString(); // paid through Sep 1
    expect(stackedPeriodEnd(activeUntil, 1, now)).toBe(new Date(Date.UTC(2026, 9, 1)).toISOString());
    const lapsed = new Date(Date.UTC(2026, 6, 1)).toISOString();
    expect(stackedPeriodEnd(lapsed, 3, now)).toBe(new Date(Date.UTC(2026, 10, 5)).toISOString());
    expect(stackedPeriodEnd(null, 12, now)).toBe(new Date(Date.UTC(2027, 7, 5)).toISOString());
  });
});
