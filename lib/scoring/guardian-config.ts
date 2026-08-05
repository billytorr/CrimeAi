// Guardian scoring configuration loader (gs.* keys in scoring_config).
// Separate from the NSS loader ON PURPOSE: the NSS module boundary test bars
// any guardian reference from NSS files, and this file may never be imported
// by nss.ts/geo.ts (CI-enforced there).

import type { GuardianConfig } from "./guardian";

export const GUARDIAN_DEFAULTS: GuardianConfig = {
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

export function validateGuardianConfig(c: GuardianConfig): void {
  if (!c.reportBase || !Object.keys(c.reportBase).length) throw new Error("guardian config: missing reportBase");
  for (const [k, v] of Object.entries(c.reportBase)) {
    if (typeof v !== "number" || v < 0) throw new Error(`guardian config: reportBase '${k}' invalid`);
  }
  for (const z of c.zeroPointClasses) {
    if ((c.reportBase[z] ?? 0) !== 0) throw new Error(`guardian config: zero-point class '${z}' has a nonzero base`);
  }
  if (c.corroborationMultiplier <= 0) throw new Error("guardian config: invalid corroborationMultiplier");
  const p = c.accuracyPrior;
  if (!(p.alpha > 0 && p.beta > 0 && p.clampMin > 0 && p.clampMax <= 1 && p.clampMin < p.clampMax)) throw new Error("guardian config: invalid accuracyPrior");
  for (const l of ["0", "1", "2", "3", "4"]) {
    if (typeof c.identityMultipliers[l] !== "number") throw new Error(`guardian config: missing identity multiplier L${l}`);
  }
  if (c.decay.floor <= 0 || c.decay.floor >= 1 || c.decay.halflifeDays <= 0) throw new Error("guardian config: invalid decay");
  if (!c.tiers.length || c.tiers[0].min !== 0) throw new Error("guardian config: tiers must start at 0");
  if (c.vestingWindowHours <= 0) throw new Error("guardian config: invalid vesting window");
}
validateGuardianConfig(GUARDIAN_DEFAULTS);

let cache: { at: number; cfg: GuardianConfig } | null = null;
const TTL_MS = 60_000;
export function _resetGuardianConfigCache() { cache = null; }

export async function loadGuardianConfig(force = false): Promise<GuardianConfig> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(false); // scoring_config is world-readable
  const { data, error } = await db.from("scoring_config").select("key, value").like("key", "gs.%");
  if (error) throw new Error(`guardian config load failed: ${error.message}`);
  const kv = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
  const D = GUARDIAN_DEFAULTS;

  const cfg: GuardianConfig = {
    reportBase: kv["gs.report_base"] ?? D.reportBase,
    zeroPointClasses: kv["gs.zero_point_classes"] ?? D.zeroPointClasses,
    corroborationMultiplier: kv["gs.corroboration_multiplier"] ?? D.corroborationMultiplier,
    earliness: kv["gs.earliness"] ? { maxBonus: kv["gs.earliness"].max_bonus, windowMinutes: kv["gs.earliness"].window_minutes } : D.earliness,
    novelty: kv["gs.novelty"] ? { first: kv["gs.novelty"].first, floor: kv["gs.novelty"].floor, decayPerDuplicate: kv["gs.novelty"].decay_per_duplicate } : D.novelty,
    conversation: kv["gs.conversation"] ? { perNetUpvote: kv["gs.conversation"].per_net_upvote, dailyCap: kv["gs.conversation"].daily_cap, diminishingAfter: kv["gs.conversation"].diminishing_after } : D.conversation,
    streak: kv["gs.streak"] ? { perDay: kv["gs.streak"].per_day, cap: kv["gs.streak"].cap, forgiveMissedDays: kv["gs.streak"].forgive_missed_days } : D.streak,
    accuracyPrior: kv["gs.accuracy_prior"] ? { alpha: kv["gs.accuracy_prior"].alpha, beta: kv["gs.accuracy_prior"].beta, clampMin: kv["gs.accuracy_prior"].clamp_min, clampMax: kv["gs.accuracy_prior"].clamp_max } : D.accuracyPrior,
    identityMultipliers: kv["gs.identity_multipliers"] ?? D.identityMultipliers,
    penalties: kv["gs.penalties"] ? { falseReportMultiplier: kv["gs.penalties"].false_report_multiplier, retractionMultiplier: kv["gs.penalties"].retraction_multiplier, flagUpheld: kv["gs.penalties"].flag_upheld, penaltyDecayRateFactor: kv["gs.penalties"].penalty_decay_rate_factor } : D.penalties,
    decay: kv["gs.decay"] ? { halflifeDays: kv["gs.decay"].halflife_days, floor: kv["gs.decay"].floor } : D.decay,
    dailyCaps: kv["gs.daily_caps"] ? { reportEvents: kv["gs.daily_caps"].report_events, corroborationEvents: kv["gs.daily_caps"].corroboration_events, contextEvents: kv["gs.daily_caps"].context_events } : D.dailyCaps,
    vestingWindowHours: kv["gs.vesting_window_hours"] ?? D.vestingWindowHours,
    tiers: kv["gs.tiers"]
      ? kv["gs.tiers"].map((t: any) => ({ name: t.name, min: t.min, identityLevel: t.identity_level, ...(t.manual_approval ? { manualApproval: true } : {}) }))
      : D.tiers,
    flipGrants: kv["gs.flip_grants"] ? { guardian: kv["gs.flip_grants"].guardian, sentinel: kv["gs.flip_grants"].sentinel, captain: kv["gs.flip_grants"].captain, captainRenewing: kv["gs.flip_grants"].captain_renewing !== false } : D.flipGrants,
    watchPointsPerGs: kv["gs.watch_points_per_gs"] ?? D.watchPointsPerGs,
  };
  validateGuardianConfig(cfg);
  cache = { at: Date.now(), cfg };
  return cfg;
}
