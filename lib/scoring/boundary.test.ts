import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// RULE 2 (non-negotiable): the NSS computation can never be influenced by
// engagement or payment — enforced HERE at the module boundary, not by
// convention. If anyone ever adds an entitlement/subscription/gamification
// import to the NSS path, CI fails.
//
// Tiering of strictness:
//   • nss.ts + geo.ts — PURE: may import only ./config (types) and ./geo.
//   • config.ts + service.ts — orchestration: may use the neutral DB client
//     (lib/payments/serverdb) and incident data (lib/data, lib/ingest), but
//     never entitlement/subscription/gamification logic.

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const FORBIDDEN_EVERYWHERE = [
  /from ["']@\/lib\/entitlements/,
  /EntitlementService/,
  /enforceConsume|isEnforcementEnabled|planLimitFor/,
  /tier_subscriptions|tier_prices|tier_limits|tier_plans/,
  /effectivePlan|protector|Protector/,
  /guardian|GuardianScore/i,       // gamification must never feed NSS either
  /watch[_ ]?points/i,
  /from ["']@\/lib\/social/,       // engagement signals (likes/follows) barred
  /trendingScore|rankForYou/,
];

const PURE_FILES = ["lib/scoring/nss.ts", "lib/scoring/geo.ts"];
const ORCHESTRATION_FILES = ["lib/scoring/config.ts", "lib/scoring/service.ts"];

describe("Rule 2 — NSS module boundary", () => {
  for (const f of [...PURE_FILES, ...ORCHESTRATION_FILES]) {
    it(`${f} has no entitlement/subscription/gamification/engagement reference`, () => {
      const src = read(f);
      for (const rx of FORBIDDEN_EVERYWHERE) {
        expect(src, `${f} must not match ${rx}`).not.toMatch(rx);
      }
    });
  }

  for (const f of PURE_FILES) {
    it(`${f} is PURE — imports only sibling scoring modules`, () => {
      const src = read(f);
      const imports = [...src.matchAll(/from ["']([^"']+)["']/g)].map((m) => m[1]);
      for (const imp of imports) {
        expect(imp.startsWith("./"), `${f} imports '${imp}' — pure NSS files may only import siblings`).toBe(true);
      }
      expect(src).not.toMatch(/serverDb|supabase|fetch\(/);
    });
  }

  it("guardian and block-strength stubs do not import nss (and vice versa)", () => {
    expect(read("lib/scoring/guardian.ts")).not.toMatch(/from ["']\.\/nss/);
    expect(read("lib/scoring/block-strength.ts")).not.toMatch(/from ["']\.\/nss/);
    expect(read("lib/scoring/nss.ts")).not.toMatch(/guardian|block-strength/);
  });

  it("the LEGACY score path remains scoring-free (parallel run, no cutover)", () => {
    // lib/data.ts computeStats must not import the new scoring module — the
    // old score keeps serving untouched until Billy signs off on cutover.
    expect(read("lib/data.ts")).not.toMatch(/from ["']@?\.?\/?lib\/scoring|from ["']\.\/scoring/);
  });
});
