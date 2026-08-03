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

  it("the guard list is non-empty (someone didn't delete the coverage)", () => {
    expect(SAFETY_FILES.length).toBeGreaterThan(0);
  });
});
