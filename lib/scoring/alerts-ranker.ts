// ALERTS FEED RANKER (Phase 9) — severity × proximity × recency ×
// actionability × report_trust.
//
// ⚠️ NON-NEGOTIABLE RULE 12: NO ENGAGEMENT SIGNALS IN THIS RANKER.
// No likes, comments, shares, reposts, views, follows, or trending score.
// In a crime app the most engaging content is the most frightening content;
// an engagement-optimized alerts feed becomes a fear machine. Engagement
// ranking belongs in the Community feed (lib/social.ts rankForYou), which is
// untouched and still serves the social surface.
//
// PROTECTOR PRIORITY IS SEVERITY-CAPPED: a paying user's minor report can
// never outrank a verified critical incident. The boost is applied INSIDE a
// severity band, never across bands.
//
// Pure functions — CI-enforced boundary (alerts-ranker.test.ts).

export interface AlertItem {
  id: string;
  severity: number;            // 1–5
  lat: number;
  lon: number;
  occurredAt: string;
  verificationStatus?: "unverified" | "corroborated" | "official_match";
  identityMultiplier?: number; // reporter's identity trust (0.25–1.25), 1 for official feeds
  accuracyFactor?: number;     // reporter's accuracy (0.1–1), 1 for official feeds
  actionable?: boolean;        // is there something the reader can do right now
  authorIsProtector?: boolean; // subscription state — permitted ONLY as an in-band tiebreak
}

export interface AlertsRankerConfig {
  severityWeight: number;
  proximityHalfMiles: number;     // distance at which proximity halves
  recencyHalfHours: number;       // age at which recency halves
  actionabilityBonus: number;     // multiplier when actionable
  corroborationFactor: { unverified: number; corroborated: number; official_match: number };
  protectorInBandBoost: number;   // small tiebreak INSIDE a severity band
  severityBandSize: number;       // band width for the cap (1 = each severity its own band)
}

export const ALERTS_DEFAULTS: AlertsRankerConfig = {
  severityWeight: 1,
  proximityHalfMiles: 1.5,
  recencyHalfHours: 6,
  actionabilityBonus: 1.25,
  corroborationFactor: { unverified: 0.0, corroborated: 0.6, official_match: 1.0 },
  protectorInBandBoost: 1.05,
  severityBandSize: 1,
};

const R = 3958.8;
function miles(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180, dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// report_trust = identity × accuracy × corroboration (spec cross-layer).
// Official feeds carry full trust by construction.
export function reportTrust(item: AlertItem, cfg: AlertsRankerConfig): number {
  const corro = cfg.corroborationFactor[item.verificationStatus ?? "official_match"] ?? 0;
  const identity = item.identityMultiplier ?? 1;
  const accuracy = item.accuracyFactor ?? 1;
  return Math.max(0, identity * accuracy * corro);
}

export function alertScore(item: AlertItem, viewer: { lat: number; lon: number }, cfg: AlertsRankerConfig, now = Date.now()): number {
  const proximity = Math.pow(0.5, miles(viewer.lat, viewer.lon, item.lat, item.lon) / cfg.proximityHalfMiles);
  const ageHours = Math.max(0, (now - +new Date(item.occurredAt)) / 3_600_000);
  const recency = Math.pow(0.5, ageHours / cfg.recencyHalfHours);
  const actionability = item.actionable ? cfg.actionabilityBonus : 1;
  const trust = reportTrust(item, cfg);
  return item.severity * cfg.severityWeight * proximity * recency * actionability * trust;
}

// Rank: severity band FIRST (descending), then in-band score. The band gate
// is what makes Protector priority structurally severity-capped.
export function rankAlerts(items: AlertItem[], viewer: { lat: number; lon: number }, cfg: AlertsRankerConfig = ALERTS_DEFAULTS, now = Date.now()): AlertItem[] {
  const band = (i: AlertItem) => Math.floor(i.severity / cfg.severityBandSize);
  return [...items].sort((a, b) => {
    const bandDiff = band(b) - band(a);
    if (bandDiff !== 0) return bandDiff;                       // higher severity band always first
    const sa = alertScore(a, viewer, cfg, now) * (a.authorIsProtector ? cfg.protectorInBandBoost : 1);
    const sb = alertScore(b, viewer, cfg, now) * (b.authorIsProtector ? cfg.protectorInBandBoost : 1);
    return sb - sa;
  });
}
