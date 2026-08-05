// Neighborhood Safety Score (NSS) — pure computation per
// crimeai-scoring-algorithm-spec.md Layer 1. No I/O, no DB: every input
// arrives as an argument, so every formula is unit-testable against
// hand-calculated fixtures.
//
//   H(a,t) = [ Σᵢ w_sev(i) × f_time(Δtᵢ, class) × f_dist(dᵢ) × w_source(i) ] / P(a)
//   NSS    = 100 × (1 − percentile_rank(H, metro distribution))
//
// RULE 2 (CI-enforced module boundary): this module must NEVER import or
// reference entitlement, billing, or reputation/gamification code of any
// kind. NSS is a factual claim about a place.
//
// RULE 10: every computation returns a full explanation of its own inputs.
//
// Phase 4 notes (honest scope):
// • P(a): census data is not yet imported; callers pass areaSqMiles and we
//   normalize by area (the spec's documented fallback), with confidence
//   lowered via populationFactor when population is unknown.
// • The 30%/5% anti-manipulation caps are implemented here but today's
//   ingest carries no per-user attribution — user-generated sources
//   currently weigh 0.0 (user_unverified), so the caps bind only once
//   corroborated user reports (Phase 5+) start contributing.

import type { NssConfig } from "./config";
import { milesApart } from "./geo";

export interface NssIncidentInput {
  category: string;        // existing app category (mapped to a spec class)
  source: string;          // incident.source (mapped to a source-weight kind)
  occurredAt: string;      // ISO
  lat: number;
  lon: number;
  userId?: string | null;  // author, when user-generated (for the 5% cap)
}

export interface AreaContext {
  lat: number;             // area center
  lon: number;
  areaSqMiles: number;     // for density normalization (population fallback)
  population?: number | null; // per-capita normalization when available
  coverageFactor?: number; // 0-1: do we have feed coverage here (default 1)
}

export interface NssExplanation {
  version: string;
  hazard: number;
  incidentCount: number;
  contributions: {         // top contributors, largest first (capped list)
    class: string; source: string; ageDays: number; distanceMiles: number;
    severityWeight: number; timeDecay: number; distKernel: number; sourceWeight: number;
    value: number;
  }[];
  byClass: Record<string, number>;
  bySourceKind: Record<string, number>;
  ugc: { rawShare: number; cappedShare: number; scaleApplied: number; singleUserCapsApplied: number };
  normalization: { mode: "population" | "area"; divisor: number };
  confidence: { value: number; coverageFactor: number; sourceDiversity: number; populationFactor: number };
  percentile: { rank: number; metroSampleSize: number };
}

export interface NssResult {
  score: number | null;    // null when confidence below pointDisplayMin
  scoreLow: number;
  scoreHigh: number;
  hazard: number;
  confidence: number;
  explanation: NssExplanation;
}

const DAY_MS = 86_400_000;

export function timeDecay(deltaMs: number, halflifeDays: number): number {
  return Math.pow(2, -(deltaMs / DAY_MS) / halflifeDays);
}

export function distKernel(dMiles: number, sigmaMiles: number): number {
  return Math.exp(-(dMiles * dMiles) / (2 * sigmaMiles * sigmaMiles));
}

export function percentileRank(value: number, distribution: number[]): number {
  if (!distribution.length) return 0.5;
  let below = 0, equal = 0;
  for (const v of distribution) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return (below + equal / 2) / distribution.length;
}

// Hazard accumulation with the two anti-manipulation caps applied to the
// user-generated share (spec Layer 1 Step 4).
export function computeHazard(
  incidents: NssIncidentInput[],
  area: AreaContext,
  cfg: NssConfig,
  now: number,
): { hazard: number; explanation: Omit<NssExplanation, "version" | "confidence" | "percentile"> } {
  const byClass: Record<string, number> = {};
  const bySourceKind: Record<string, number> = {};
  const contributions: NssExplanation["contributions"] = [];

  const USER_KINDS = new Set(["user_official_match", "user_corroborated", "user_unverified"]);
  let officialSignal = 0;
  let ugcSignal = 0;
  const perUserSignal: Record<string, number> = {};

  for (const i of incidents) {
    const cls = cfg.categoryClassMap[i.category] ?? "quality_of_life";
    const sev = cfg.severityClasses[cls];
    if (!sev) continue;
    const kind = cfg.sourceKindMap[i.source] ?? "user_unverified"; // unknown sources: least credible
    const w = cfg.sourceWeights[kind] ?? 0;
    const ageMs = Math.max(0, now - +new Date(i.occurredAt));
    const d = milesApart(area.lat, area.lon, i.lat, i.lon);
    const ft = timeDecay(ageMs, sev.halflifeDays);
    const fd = distKernel(d, cfg.spatialSigmaMiles);
    const value = sev.weight * ft * fd * w;
    if (value <= 0) continue;

    byClass[cls] = (byClass[cls] || 0) + value;
    bySourceKind[kind] = (bySourceKind[kind] || 0) + value;
    contributions.push({
      class: cls, source: i.source, ageDays: Math.round(ageMs / DAY_MS), distanceMiles: round3(d),
      severityWeight: sev.weight, timeDecay: round3(ft), distKernel: round3(fd), sourceWeight: w,
      value: round3(value),
    });

    if (USER_KINDS.has(kind)) {
      ugcSignal += value;
      const uid = i.userId || "unknown";
      perUserSignal[uid] = (perUserSignal[uid] || 0) + value;
    } else {
      officialSignal += value;
    }
  }

  // Cap 2 first: a single user ≤ singleUserShareMax of UGC contribution.
  let singleUserCapsApplied = 0;
  let cappedUgc = ugcSignal;
  if (ugcSignal > 0) {
    const maxPerUser = cfg.caps.singleUserShareMax * ugcSignal;
    for (const v of Object.values(perUserSignal)) {
      if (v > maxPerUser) { cappedUgc -= v - maxPerUser; singleUserCapsApplied++; }
    }
  }
  // Cap 1: UGC ≤ ugcShareMax of TOTAL signal → scale down proportionally.
  const rawTotal = officialSignal + cappedUgc;
  let scale = 1;
  if (rawTotal > 0 && cappedUgc / rawTotal > cfg.caps.ugcShareMax) {
    // solve ugc' = cap × (official + ugc')  →  ugc' = cap×official / (1−cap)
    const target = (cfg.caps.ugcShareMax * officialSignal) / (1 - cfg.caps.ugcShareMax);
    scale = cappedUgc > 0 ? target / cappedUgc : 0;
  }
  const finalUgc = cappedUgc * scale;
  const total = officialSignal + finalUgc;

  const mode: "population" | "area" = area.population && area.population > 0 ? "population" : "area";
  const divisor = mode === "population" ? (area.population as number) : Math.max(0.05, area.areaSqMiles);
  const hazard = total / divisor;

  contributions.sort((a, b) => b.value - a.value);
  return {
    hazard,
    explanation: {
      hazard: round3(hazard),
      incidentCount: incidents.length,
      contributions: contributions.slice(0, 25),
      byClass: roundAll(byClass),
      bySourceKind: roundAll(bySourceKind),
      ugc: {
        rawShare: rawTotal + (ugcSignal - cappedUgc) > 0 ? round3(ugcSignal / (officialSignal + ugcSignal || 1)) : 0,
        cappedShare: total > 0 ? round3(finalUgc / total) : 0,
        scaleApplied: round3(scale),
        singleUserCapsApplied,
      },
      normalization: { mode, divisor: round3(divisor) },
    },
  };
}

export function computeConfidence(
  area: AreaContext,
  sourceKindsPresent: number,
  cfg: NssConfig,
): { value: number; coverageFactor: number; sourceDiversity: number; populationFactor: number } {
  const coverageFactor = clamp01(area.coverageFactor ?? 1);
  const sourceDiversity = clamp01(sourceKindsPresent / cfg.confidence.sourceDiversityTarget);
  // saturating curve on population; unknown population = the fallback path,
  // which the spec says must lower confidence
  const populationFactor = area.population && area.population > 0
    ? clamp01(1 - Math.exp(-area.population / cfg.confidence.populationSaturation))
    : 0.5;
  return {
    value: Math.min(1, coverageFactor * sourceDiversity * populationFactor),
    coverageFactor, sourceDiversity, populationFactor,
  };
}

export function computeNSS(
  incidents: NssIncidentInput[],
  area: AreaContext,
  metroHazards: number[],   // hazard distribution across metro areas (for percentile)
  cfg: NssConfig,
  now: number = Date.now(),
): NssResult {
  const { hazard, explanation } = computeHazard(incidents, area, cfg, now);
  const rank = percentileRank(hazard, metroHazards);
  const point = Math.round(100 * (1 - rank));

  const kindsPresent = Object.keys(explanation.bySourceKind).length;
  const conf = computeConfidence(area, kindsPresent, cfg);

  // Range width grows as confidence falls (±(1−C)×25, min ±3).
  const half = Math.max(3, Math.round((1 - conf.value) * 25));
  const scoreLow = Math.max(0, point - half);
  const scoreHigh = Math.min(100, point + half);

  return {
    score: conf.value >= cfg.confidence.pointDisplayMin ? point : null,
    scoreLow, scoreHigh,
    hazard,
    confidence: round3(conf.value),
    explanation: {
      version: cfg.version,
      ...explanation,
      confidence: { value: round3(conf.value), coverageFactor: round3(conf.coverageFactor), sourceDiversity: round3(conf.sourceDiversity), populationFactor: round3(conf.populationFactor) },
      percentile: { rank: round3(rank), metroSampleSize: metroHazards.length },
    },
  };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round3 = (x: number) => Math.round(x * 1000) / 1000;
function roundAll(m: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round3(v)]));
}
