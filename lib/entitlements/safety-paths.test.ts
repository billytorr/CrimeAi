import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// ══════════════════════════════════════════════════════════════════
// RULE 1 (non-negotiable): SOS, Walk-with-me, one-tap 911, Trusted
// Circle dispatch, and critical-severity alert dispatch must contain
// NO reference to tier / plan / subscription / entitlement anywhere in
// their code path — not even a check that always returns true. If there
// is no entitlement lookup in the path, a billing outage, DB failure, or
// entitlement bug is STRUCTURALLY incapable of suppressing an emergency.
//
// This test is wired into CI (npm test). It fails the build if anyone
// ever imports the entitlement layer into a safety file.
//
// As real dispatch backends are built (Trusted Circle send, critical
// alert fan-out), ADD their files here. A safety file with no guard is
// the failure mode this test exists to prevent.
// ══════════════════════════════════════════════════════════════════
const SAFETY_FILES = [
  "components/SOS.tsx", // SOS menu, "I'm not safe", Walk-with-me, one-tap 911, Notify circle
];

const FORBIDDEN = [
  /from\s+["']@\/lib\/entitlements/, // importing the entitlement layer
  /EntitlementService/,
  /\bentitlement/i,
  /\btier_/, // tier_subscriptions / tier_limits / tier_plans
  /\bsubscription\b/i,
  /\bconsume_usage\b/,
  /can\(\s*(user|account|profile)/i, // an entitlement-style can() gate
  // Gamification build, Rule 1: safety paths must also be free of every
  // scoring concept — a scoring bug must be structurally incapable of
  // touching an emergency path.
  /from\s+["']@\/lib\/scoring/,
  /GuardianScore|BlockStrength|ScoringService/,
  /\bguardian[_ ]?score\b/i,
  /\bblock[_ ]?strength\b/i,
  /\bidentity[_ ]?level\b/i,
  /\bwatch[_ ]?points\b/i,
];

// Applied to SAFETY_FILES only — NOT to AppLock, which is the lock itself and
// necessarily imports this layer. An emergency must never wait on a
// fingerprint, so SOS may not authenticate anybody.
const NO_BIOMETRIC = [
  /from\s+["']@\/lib\/biometric/,
  /\bbiometr/i,
  /\bFace\s?ID\b/i,
  /\bTouch\s?ID\b/i,
];

describe("Rule 1 — safety paths have zero entitlement dependency", () => {
  for (const file of SAFETY_FILES) {
    it(`${file} contains no entitlement/tier/subscription reference`, () => {
      const abs = path.join(process.cwd(), file);
      expect(existsSync(abs), `${file} should exist`).toBe(true);
      const src = readFileSync(abs, "utf8");
      for (const pat of FORBIDDEN) {
        const m = src.match(pat);
        expect(m, `${file} must not reference ${pat} (found: ${m?.[0]})`).toBeNull();
      }
    });
  }

  for (const file of SAFETY_FILES) {
    it(`${file} never gates an emergency behind biometrics`, () => {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      for (const pat of NO_BIOMETRIC) {
        const m = src.match(pat);
        expect(m, `${file} must not reference ${pat} (found: ${m?.[0]})`).toBeNull();
      }
    });
  }

  it("the guard list is non-empty (someone didn't delete the coverage)", () => {
    expect(SAFETY_FILES.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// The app lock hides the user's content behind Face ID / fingerprint. The
// one thing it must NOT hide is the way to call for help: biometrics fail
// routinely — a mask, the dark, wet or shaking hands — and "authenticate
// before you can call for help" is the one failure this app cannot ship.
//
// These tests are the structural guarantee that the escape hatch survives
// future edits to AppLock.tsx.
// ══════════════════════════════════════════════════════════════════
describe("Rule 1 — the lock screen never blocks SOS", () => {
  const abs = path.join(process.cwd(), "components/AppLock.tsx");

  it("AppLock exists and renders the real SOS component", () => {
    expect(existsSync(abs), "components/AppLock.tsx should exist").toBe(true);
    const src = readFileSync(abs, "utf8");
    // the genuine article, not a lookalike button that does nothing
    expect(src).toMatch(/from\s+["']@\/components\/SOS["']/);
    expect(src).toMatch(/<SosSheets\b/);
  });

  it("the SOS control is not disabled or hidden while locked", () => {
    const src = readFileSync(abs, "utf8");
    // Scope to the SOS <button> element itself — a wider window picks up the
    // unlock button's `disabled:opacity-60` and fails for the wrong reason.
    const label = src.indexOf("Emergency — SOS");
    expect(label, "the SOS button label should be present").toBeGreaterThan(-1);
    const sosButton = src.slice(src.lastIndexOf("<button", label), label);

    // Unconditionally rendered: no disabled state, no auth check in front.
    expect(sosButton).not.toMatch(/disabled/);
    expect(sosButton).not.toMatch(/unlocked|authenticated|verified/i);
    expect(sosButton).toMatch(/onClick/);
  });

  it("AppLock carries no entitlement, tier or scoring dependency", () => {
    const src = readFileSync(abs, "utf8");
    for (const pat of FORBIDDEN) {
      const m = src.match(pat);
      expect(m, `AppLock must not reference ${pat} (found: ${m?.[0]})`).toBeNull();
    }
  });

  it("an unavailable sensor fails OPEN, never locking the user out", () => {
    const src = readFileSync(abs, "utf8");
    // if biometry is unavailable we must call onUnlock, not strand the user
    expect(src).toMatch(/if\s*\(!s\.available\)\s*onUnlock\(\)/);
  });
});
