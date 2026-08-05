import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rankAlerts, alertScore, reportTrust, ALERTS_DEFAULTS, type AlertItem } from "./alerts-ranker";

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);
const VIEWER = { lat: 25.7617, lon: -80.1918 };
const item = (over: Partial<AlertItem> = {}): AlertItem => ({
  id: "x", severity: 3, lat: VIEWER.lat, lon: VIEWER.lon,
  occurredAt: new Date(NOW).toISOString(), verificationStatus: "official_match", ...over,
});

// ── NON-NEGOTIABLE RULE 12 ──────────────────────────────────────────
describe("RULE 12: no engagement signals in the alerts ranker", () => {
  const src = readFileSync(join(__dirname, "alerts-ranker.ts"), "utf8");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

  it("the module contains no engagement term at all", () => {
    for (const banned of [/\blikes\b/i, /\bcomments\b/i, /\bshares\b/i, /\breposts\b/i, /\bviews\b/i, /trendingScore/, /rankForYou/, /\bfollow/i, /\bupvote/i, /\bengagement\b/i]) {
      expect(code, `alerts-ranker must not reference ${banned}`).not.toMatch(banned);
    }
  });
  it("it never imports the social/engagement module", () => {
    expect(code).not.toMatch(/from ["']@\/lib\/social/);
  });
  it("BEHAVIORAL PROOF: engagement fields on an item change nothing", () => {
    const plain = item();
    const viral = { ...item(), likes: 99999, comments: 5000, shares: 4000, reposts: 900 } as AlertItem;
    expect(alertScore(viral, VIEWER, ALERTS_DEFAULTS, NOW)).toBe(alertScore(plain, VIEWER, ALERTS_DEFAULTS, NOW));
  });
});

// ── severity cap on Protector priority ──────────────────────────────
describe("Protector priority is SEVERITY-CAPPED", () => {
  it("a Protector's MINOR report never outranks a verified CRITICAL incident", () => {
    const protectorMinor = item({ id: "protector-minor", severity: 1, authorIsProtector: true, actionable: true });
    const criticalFree = item({ id: "critical", severity: 5, authorIsProtector: false,
      lat: VIEWER.lat + 0.05, lon: VIEWER.lon + 0.05,                    // farther away
      occurredAt: new Date(NOW - 5 * 3_600_000).toISOString() });        // and older
    const ranked = rankAlerts([protectorMinor, criticalFree], VIEWER, ALERTS_DEFAULTS, NOW);
    expect(ranked[0].id).toBe("critical");
  });
  it("even 100 Protector minor reports cannot displace one critical", () => {
    const many = Array.from({ length: 100 }, (_, i) => item({ id: `p${i}`, severity: 2, authorIsProtector: true }));
    const critical = item({ id: "critical", severity: 5, occurredAt: new Date(NOW - 12 * 3_600_000).toISOString() });
    expect(rankAlerts([...many, critical], VIEWER, ALERTS_DEFAULTS, NOW)[0].id).toBe("critical");
  });
  it("WITHIN the same severity band, Protector gets only a small tiebreak", () => {
    const pro = item({ id: "pro", severity: 3, authorIsProtector: true });
    const free = item({ id: "free", severity: 3, authorIsProtector: false });
    expect(rankAlerts([free, pro], VIEWER, ALERTS_DEFAULTS, NOW)[0].id).toBe("pro");
    // but a materially closer/fresher free item still wins in-band
    const closerFree = item({ id: "closer-free", severity: 3, lat: VIEWER.lat, lon: VIEWER.lon });
    const farPro = item({ id: "far-pro", severity: 3, authorIsProtector: true, lat: VIEWER.lat + 0.05, lon: VIEWER.lon + 0.05 });
    expect(rankAlerts([farPro, closerFree], VIEWER, ALERTS_DEFAULTS, NOW)[0].id).toBe("closer-free");
  });
});

describe("ranking signals — severity, proximity, recency, actionability, trust", () => {
  it("closer beats farther at equal severity", () => {
    const near = item({ id: "near" });
    const far = item({ id: "far", lat: VIEWER.lat + 0.1, lon: VIEWER.lon });
    expect(rankAlerts([far, near], VIEWER, ALERTS_DEFAULTS, NOW)[0].id).toBe("near");
  });
  it("fresher beats older at equal severity", () => {
    const fresh = item({ id: "fresh" });
    const old = item({ id: "old", occurredAt: new Date(NOW - 24 * 3_600_000).toISOString() });
    expect(rankAlerts([old, fresh], VIEWER, ALERTS_DEFAULTS, NOW)[0].id).toBe("fresh");
  });
  it("actionable items get a bounded lift", () => {
    const a = alertScore(item({ actionable: true }), VIEWER, ALERTS_DEFAULTS, NOW);
    const b = alertScore(item({ actionable: false }), VIEWER, ALERTS_DEFAULTS, NOW);
    expect(a / b).toBeCloseTo(ALERTS_DEFAULTS.actionabilityBonus, 6);
  });
  it("report_trust = identity × accuracy × corroboration; unverified user reports score ZERO", () => {
    expect(reportTrust(item({ verificationStatus: "unverified", identityMultiplier: 1.25, accuracyFactor: 1 }), ALERTS_DEFAULTS)).toBe(0);
    expect(reportTrust(item({ verificationStatus: "corroborated", identityMultiplier: 1, accuracyFactor: 1 }), ALERTS_DEFAULTS)).toBe(0.6);
    expect(reportTrust(item({ verificationStatus: "official_match" }), ALERTS_DEFAULTS)).toBe(1);
    // an unverified item scores 0 overall and sinks below any trusted item
    const unverified = item({ id: "unverified", severity: 5, verificationStatus: "unverified" });
    const trusted = item({ id: "trusted", severity: 5, verificationStatus: "official_match", occurredAt: new Date(NOW - 20 * 3_600_000).toISOString() });
    expect(rankAlerts([unverified, trusted], VIEWER, ALERTS_DEFAULTS, NOW)[0].id).toBe("trusted");
  });
  it("a higher-identity, more-accurate reporter outranks a shakier one, all else equal", () => {
    const strong = item({ id: "strong", verificationStatus: "corroborated", identityMultiplier: 1.25, accuracyFactor: 0.95 });
    const weak = item({ id: "weak", verificationStatus: "corroborated", identityMultiplier: 0.25, accuracyFactor: 0.3 });
    expect(rankAlerts([weak, strong], VIEWER, ALERTS_DEFAULTS, NOW)[0].id).toBe("strong");
  });
});

describe("the Community feed keeps its engagement ranking (untouched)", () => {
  it("lib/social.ts rankForYou still uses engagement — the split is real", () => {
    const social = readFileSync(join(__dirname, "..", "social.ts"), "utf8");
    expect(social).toMatch(/trendingScore/);   // community feed: engagement allowed
    expect(social).toMatch(/rankForYou/);
  });
});
