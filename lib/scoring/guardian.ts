// Guardian Score (Layer 2) — pure computation per the scoring spec.
// Range 0–1000. Reputation: engagement moves it (that is its purpose),
// PAYMENT NEVER DOES — there is no billing input anywhere in this module.
//
//   GS = (ContributionValue × AccuracyFactor × IdentityTrustMultiplier
//         − Penalties) × DecayFactor
//
// AccuracyFactor is a MULTIPLIER, not an addend: volume without accuracy
// earns nothing. Identity level arrives as a plain number (0–4) — this
// module imports nothing (boundary: never ./nss, never billing).

export interface GuardianConfig {
  reportBase: Record<string, number>;
  zeroPointClasses: string[];
  corroborationMultiplier: number;
  earliness: { maxBonus: number; windowMinutes: number };
  novelty: { first: number; floor: number; decayPerDuplicate: number };
  conversation: { perNetUpvote: number; dailyCap: number; diminishingAfter: number };
  streak: { perDay: number; cap: number; forgiveMissedDays: number };
  accuracyPrior: { alpha: number; beta: number; clampMin: number; clampMax: number };
  identityMultipliers: Record<string, number>;
  penalties: { falseReportMultiplier: number; retractionMultiplier: number; flagUpheld: number; penaltyDecayRateFactor: number };
  decay: { halflifeDays: number; floor: number };
  dailyCaps: { reportEvents: number; corroborationEvents: number; contextEvents: number };
  vestingWindowHours: number;
  tiers: { name: string; min: number; identityLevel: number; manualApproval?: boolean }[];
  flipGrants: { guardian: number; sentinel: number; captain: number; captainRenewing: boolean };
  watchPointsPerGs: number;
}

// ── earning valuations ──────────────────────────────────────────────

// Per verified report: base(class) × earliness × novelty.
// ZERO for configured classes (suspicious-person: rewarding that category
// manufactures racial profiling at scale — hard rule, tested).
export function reportValue(
  cls: string,
  minutesAheadOfOfficial: number,
  duplicateIndex: number, // 0 = first report of the incident
  cfg: GuardianConfig,
): number {
  if (cfg.zeroPointClasses.includes(cls)) return 0;
  const base = cfg.reportBase[cls] ?? 0;
  if (base <= 0) return 0;
  const earliness = 1 + Math.min(cfg.earliness.maxBonus, Math.max(0, minutesAheadOfOfficial) / cfg.earliness.windowMinutes);
  const novelty = Math.max(cfg.novelty.floor, cfg.novelty.first - duplicateIndex * cfg.novelty.decayPerDuplicate);
  return round2(base * earliness * novelty);
}

// Corroborating a report that later proves correct: ~1.5× the per-unit value
// of posting (verification is the scarce, high-value behavior).
export function corroborationValue(cls: string, cfg: GuardianConfig): number {
  if (cfg.zeroPointClasses.includes(cls)) return 0;
  return round2((cfg.reportBase[cls] ?? 0) * cfg.corroborationMultiplier);
}

// Net upvotes with diminishing returns and a hard daily cap — never raw count.
export function conversationValue(netUpvotesToday: number, cfg: GuardianConfig): number {
  const { perNetUpvote, dailyCap, diminishingAfter } = cfg.conversation;
  const n = Math.max(0, netUpvotesToday);
  const full = Math.min(n, diminishingAfter) * perNetUpvote;
  const diminished = Math.max(0, n - diminishingAfter) * perNetUpvote * 0.5;
  return round2(Math.min(dailyCap, full + diminished));
}

// Streak: capped; a single missed day is forgiven upstream (streak counter
// logic), so this just values the streak length.
export function streakValue(streakDays: number, cfg: GuardianConfig): number {
  return round2(Math.min(cfg.streak.cap, Math.max(0, streakDays) * cfg.streak.perDay));
}

// ── multipliers & penalties ─────────────────────────────────────────

// Bayesian-smoothed accuracy, clamped: a new user with 1 verified report is
// not at 100%; a terrible record cannot earn but never goes negative here.
export function accuracyFactor(verified: number, rejected: number, cfg: GuardianConfig): number {
  const { alpha, beta, clampMin, clampMax } = cfg.accuracyPrior;
  const raw = (verified + alpha) / (verified + rejected + alpha + beta);
  return Math.min(clampMax, Math.max(clampMin, raw));
}

export function identityMultiplier(level: number, cfg: GuardianConfig): number {
  return cfg.identityMultipliers[String(level)] ?? cfg.identityMultipliers["0"] ?? 0.25;
}

export function penaltyValue(kind: "false_report" | "retraction" | "flag_upheld", cls: string | null, cfg: GuardianConfig): number {
  if (kind === "flag_upheld") return cfg.penalties.flagUpheld;
  const base = cls ? cfg.reportBase[cls] ?? 0 : 0;
  return round2(base * (kind === "false_report" ? cfg.penalties.falseReportMultiplier : cfg.penalties.retractionMultiplier));
}

// Whole-score inactivity decay: floors at 60% of peak — long-time
// contributors are dimmed, never erased.
export function decayFactor(daysInactive: number, cfg: GuardianConfig): number {
  return Math.max(cfg.decay.floor, Math.pow(2, -Math.max(0, daysInactive) / cfg.decay.halflifeDays));
}

// Penalties age at HALF the earn decay rate (rebuilding trust takes longer
// than losing it): half rate ⇒ double half-life, and no floor.
export function penaltyDecayFactor(daysSincePenalty: number, cfg: GuardianConfig): number {
  const halflife = cfg.decay.halflifeDays / cfg.penalties.penaltyDecayRateFactor;
  return Math.pow(2, -Math.max(0, daysSincePenalty) / halflife);
}

// ── assembly ────────────────────────────────────────────────────────

export interface GuardianInputs {
  contributionValue: number;   // Σ settled earnings (already valued per event)
  agedPenalties: number;       // Σ penalties × penaltyDecayFactor (caller ages each)
  verified: number;
  rejected: number;
  identityLevel: number;       // 0–4 from the identity subsystem
  daysInactive: number;
}

export interface GuardianScoreResult {
  score: number;               // 0–1000
  explanation: {
    contributionValue: number;
    accuracyFactor: number;
    identityMultiplier: number;
    penalties: number;
    decayFactor: number;
    formula: string;
  };
}

export function computeGuardianScore(inputs: GuardianInputs, cfg: GuardianConfig): GuardianScoreResult {
  const af = accuracyFactor(inputs.verified, inputs.rejected, cfg);
  const im = identityMultiplier(inputs.identityLevel, cfg);
  const df = decayFactor(inputs.daysInactive, cfg);
  const raw = (inputs.contributionValue * af * im - inputs.agedPenalties) * df;
  const score = Math.max(0, Math.min(1000, round2(raw)));
  return {
    score,
    explanation: {
      contributionValue: round2(inputs.contributionValue),
      accuracyFactor: round3(af),
      identityMultiplier: im,
      penalties: round2(inputs.agedPenalties),
      decayFactor: round3(df),
      formula: "(contribution × accuracy × identity − penalties) × decay, clamped 0–1000",
    },
  };
}

// Tier: highest tier whose score minimum AND identity requirement are met.
// Captain additionally requires manual approval — never automatic, never
// purchasable.
export function tierOf(score: number, identityLevel: number, cfg: GuardianConfig, captainApproved = false): string {
  let best = cfg.tiers[0]?.name ?? "neighbor";
  for (const t of [...cfg.tiers].sort((a, b) => a.min - b.min)) {
    const identityOk = identityLevel >= t.identityLevel;
    const approvalOk = !t.manualApproval || captainApproved;
    if (score >= t.min && identityOk && approvalOk) best = t.name;
  }
  return best;
}

// ── Phase 8: the Protector flip (pure parts) ────────────────────────

const TIER_RANK: Record<string, number> = { neighbor: 0, watcher: 1, guardian: 2, sentinel: 3, captain: 4 };

// Months granted when PROMOTED into a granting tier. Reputation earns the
// paid tier; payment never earns reputation.
export function flipGrantMonths(previousTier: string, newTier: string, cfg: GuardianConfig): number {
  if ((TIER_RANK[newTier] ?? 0) <= (TIER_RANK[previousTier] ?? 0)) return 0;
  if (newTier === "captain") return cfg.flipGrants.captain;
  if (newTier === "sentinel") return cfg.flipGrants.sentinel;
  if (newTier === "guardian") return cfg.flipGrants.guardian;
  return 0;
}

// Stacking: a grant EXTENDS the existing subscription period (paid or
// comped) rather than replacing it; with no active period it starts now.
export function stackedPeriodEnd(existingPeriodEnd: string | null, months: number, now: number): string {
  const base = existingPeriodEnd && +new Date(existingPeriodEnd) > now ? +new Date(existingPeriodEnd) : now;
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
