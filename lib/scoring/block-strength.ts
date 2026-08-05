// Block Strength (Layer 3) — how well-WATCHED a place is, not how safe.
// Range 0–100 per neighborhood cell.
//
//   BS = 100 × (0.35·Coverage + 0.20·Responsiveness + 0.15·CorroborationRate
//              + 0.15·TemporalCoverage + 0.10·CircleDensity + 0.05·VerifiedShare)
//
// ⚠️ CRIME RATE IS EXPLICITLY NOT AN INPUT. If it were, this would just be
// NSS with extra steps and the integrity of the whole design collapses.
// Enforced by CI: this module may never import ./nss, and no input field
// here may carry incident/hazard/severity data (block-strength.test.ts).
//
// Pure functions — no I/O, no DB.

export interface BlockStrengthConfig {
  weights: { coverage: number; responsiveness: number; corroborationRate: number; temporalCoverage: number; circleDensity: number; verifiedShare: number };
  coverageK: number;                 // saturation constant (≈25: 10% household penetration is excellent)
  responseTargetMinutes: number;     // median-time target (≈15)
  verifiedMinLevel: number;          // identity level counted as "verified" (3)
  tiers: { name: string; min: number }[];
}

export interface BlockStrengthInputs {
  activeUsers: number;
  households: number;
  medianResponseMinutes: number | null;  // how fast neighbors confirm a local post
  reportsInWindow: number;
  reportsCorroborated: number;
  hourlyBucketsCovered: number;          // of 24, trailing 14 days
  usersWithCircle2Plus: number;
  usersAtVerifiedLevel: number;
}

export interface BlockStrengthResult {
  score: number;
  tier: string;
  explanation: {
    components: { coverage: number; responsiveness: number; corroborationRate: number; temporalCoverage: number; circleDensity: number; verifiedShare: number };
    weighted: Record<string, number>;
    gaps: { component: string; value: number; hint: string }[];
    temporalGapHours: number[];          // which hours have nobody watching
    crimeRateUsed: false;                // structural assertion, serialized into every explanation
  };
}

// Saturating: 10% household penetration is excellent, so the curve flattens.
export function coverage(activeUsers: number, households: number, k: number): number {
  if (households <= 0) return 0;
  return clamp01(1 - Math.exp(-k * (Math.max(0, activeUsers) / households)));
}

// Inverted + normalized against a target: at/under target = 1, decaying after.
export function responsiveness(medianMinutes: number | null, targetMinutes: number): number {
  if (medianMinutes == null) return 0;      // no corroborations yet = no responsiveness signal
  if (medianMinutes <= 0) return 1;
  return clamp01(targetMinutes / Math.max(medianMinutes, targetMinutes));
}

export function corroborationRate(reportsCorroborated: number, reportsInWindow: number): number {
  if (reportsInWindow <= 0) return 0;
  return clamp01(reportsCorroborated / reportsInWindow);
}

// The genuinely useful insight: nobody is watching 2am–6am.
export function temporalCoverage(hourlyBucketsCovered: number): number {
  return clamp01(hourlyBucketsCovered / 24);
}

export function circleDensity(usersWithCircle2Plus: number, activeUsers: number): number {
  if (activeUsers <= 0) return 0;
  return clamp01(usersWithCircle2Plus / activeUsers);
}

export function verifiedShare(usersAtVerifiedLevel: number, activeUsers: number): number {
  if (activeUsers <= 0) return 0;
  return clamp01(usersAtVerifiedLevel / activeUsers);
}

export function computeBlockStrength(
  input: BlockStrengthInputs,
  cfg: BlockStrengthConfig,
  hourlyPresence: boolean[] = [],
): BlockStrengthResult {
  const components = {
    coverage: coverage(input.activeUsers, input.households, cfg.coverageK),
    responsiveness: responsiveness(input.medianResponseMinutes, cfg.responseTargetMinutes),
    corroborationRate: corroborationRate(input.reportsCorroborated, input.reportsInWindow),
    temporalCoverage: temporalCoverage(input.hourlyBucketsCovered),
    circleDensity: circleDensity(input.usersWithCircle2Plus, input.activeUsers),
    verifiedShare: verifiedShare(input.usersAtVerifiedLevel, input.activeUsers),
  };
  const w = cfg.weights;
  const weighted = {
    coverage: components.coverage * w.coverage,
    responsiveness: components.responsiveness * w.responsiveness,
    corroborationRate: components.corroborationRate * w.corroborationRate,
    temporalCoverage: components.temporalCoverage * w.temporalCoverage,
    circleDensity: components.circleDensity * w.circleDensity,
    verifiedShare: components.verifiedShare * w.verifiedShare,
  };
  const score = round1(100 * Object.values(weighted).reduce((a, b) => a + b, 0));

  // recruitment drivers: the weakest components, largest weighted headroom first
  const gaps = (Object.keys(components) as (keyof typeof components)[])
    .map((k) => ({ component: k, value: round3(components[k]), headroom: (1 - components[k]) * w[k], hint: HINTS[k] }))
    .sort((a, b) => b.headroom - a.headroom)
    .slice(0, 3)
    .map(({ component, value, hint }) => ({ component, value, hint }));

  const temporalGapHours = hourlyPresence.length === 24
    ? hourlyPresence.map((covered, h) => (covered ? -1 : h)).filter((h) => h >= 0)
    : [];

  return {
    score,
    tier: tierFor(score, cfg),
    explanation: { components: roundAll(components), weighted: roundAll(weighted), gaps, temporalGapHours, crimeRateUsed: false },
  };
}

const HINTS: Record<string, string> = {
  coverage: "Invite neighbors — more watchers is the single biggest lift",
  responsiveness: "Reports are going unconfirmed too long; corroborate quickly",
  corroborationRate: "Most local reports never get a second confirmation",
  temporalCoverage: "Some hours have nobody watching",
  circleDensity: "Few neighbors have a Trusted Circle set up",
  verifiedShare: "Few verified neighbors in this area",
};

export function tierFor(score: number, cfg: BlockStrengthConfig): string {
  let best = cfg.tiers[0]?.name ?? "dark";
  for (const t of [...cfg.tiers].sort((a, b) => a.min - b.min)) if (score >= t.min) best = t.name;
  return best;
}

// How many more active users to reach the next tier — the recruitment number
// ("3 more neighbors reaches Protected"). Pure inverse of the coverage curve.
export function neighborsToNextTier(input: BlockStrengthInputs, cfg: BlockStrengthConfig): { nextTier: string | null; neighborsNeeded: number | null } {
  const current = computeBlockStrength(input, cfg);
  const sorted = [...cfg.tiers].sort((a, b) => a.min - b.min);
  const next = sorted.find((t) => t.min > current.score);
  if (!next) return { nextTier: null, neighborsNeeded: null };
  for (let extra = 1; extra <= 500; extra++) {
    const probe = computeBlockStrength({ ...input, activeUsers: input.activeUsers + extra }, cfg);
    if (probe.score >= next.min) return { nextTier: next.name, neighborsNeeded: extra };
  }
  return { nextTier: next.name, neighborsNeeded: null }; // unreachable by recruitment alone
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round1 = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
function roundAll<T extends Record<string, number>>(m: T): T {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round3(v)])) as T;
}
