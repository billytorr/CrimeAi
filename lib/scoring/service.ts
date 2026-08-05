// ScoringService — orchestration for the PARALLEL NSS run (Phase 4).
// Composes: area list (the 24-neighborhood gazetteer) → incident pools (the
// exact same live/seed/synth selection the legacy score uses) → pure NSS
// computation → persistence (area_scores + append-only history).
//
// THE LEGACY SAFETY SCORE IS UNTOUCHED: lib/data.ts computeStats still
// serves every user-facing surface. This service only WRITES the new
// parallel score tables and produces the old-vs-new divergence report for
// Billy's cutover review. Nothing user-facing reads area_scores yet.
//
// Boundary note (Rule 2): the pure computation lives in nss.ts (no I/O).
// This orchestrator imports incident data (lib/data, lib/ingest/live) and
// the neutral service-role DB client — never entitlement/subscription/
// gamification logic. CI-enforced by lib/scoring/boundary.test.ts.

import { NEIGHBORHOODS, incidentsNear, computeStats, insideMiamiCoverage } from "@/lib/data";
import { liveIncidentsNear } from "@/lib/ingest/live";
import { loadScoringConfig } from "./config";
import { computeNSS, type NssIncidentInput, type NssResult } from "./nss";
import { populationForArea, censusRelease } from "./census";
import type { Incident } from "@/lib/types";

// Minimum incidents in the PRIOR window before a trend percentage is
// meaningful. Below this we report direction "insufficient_data" and no pct.
const TREND_MIN_PRIOR_INCIDENTS = 10;

export interface AreaDef { areaKey: string; areaKind: "neighborhood"; lat: number; lon: number }

export function listAreas(): AreaDef[] {
  return NEIGHBORHOODS.map((n) => ({
    areaKey: n.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    areaKind: "neighborhood",
    lat: n.lat,
    lon: n.lon,
  }));
}

function toNssInput(i: Incident): NssIncidentInput {
  return { category: i.category, source: i.source, occurredAt: i.occurred_at, lat: i.lat, lon: i.lon, userId: null };
}

function poolKind(live: Incident[], lat: number, lon: number): "live" | "seed" | "synth" {
  if (live.length >= 3) return "live";                 // same threshold as lib/data.ts:147
  return insideMiamiCoverage(lat, lon) ? "seed" : "synth";
}

export interface CompanionMetrics {
  // `pct` is null when the prior window is too thin to divide by — a small
  // baseline produces absurd percentages (+8300%) that read as fact.
  trend: { last30: number; prior90PerMonth: number; pct: number | null; direction: "up" | "down" | "flat" | "insufficient_data" };
  hourHistogram: number[];              // 24 buckets, incident counts
  cityComparisonPct: number;            // hazard vs metro median, %
  dominantClasses: { class: string; share: number }[]; // top 3 by hazard share
  population: { value: number | null; source: string };
}

export interface AreaComputation {
  area: AreaDef;
  result: NssResult;
  companion: CompanionMetrics;
  legacyScore: number;      // old computeStats safetyScore on the same spot (30d window)
  pool: "live" | "seed" | "synth";
}

// Companion DISPLAY metrics (spec Layer 1: "not score inputs") — computed
// alongside the score, never fed back into it.
function companionMetrics(
  incidents: NssIncidentInput[],
  hazard: number,
  byClass: Record<string, number>,
  metroHazards: number[],
  population: number | null,
  now: number,
): CompanionMetrics {
  const DAY = 86_400_000;
  let last30 = 0, prior90 = 0;
  const hourHistogram = new Array(24).fill(0);
  for (const i of incidents) {
    const t = +new Date(i.occurredAt);
    const age = now - t;
    if (age <= 30 * DAY) last30++;
    else if (age <= 120 * DAY) prior90++;
    hourHistogram[new Date(t).getHours()]++;
  }
  // A percentage change needs a real baseline. With only a handful of prior
  // incidents the ratio explodes (0.7/month vs 56 → "+8300%"), which reads as
  // a factual spike when it is really "we barely have history here".
  const prior90PerMonth = prior90 / 3;
  const enoughBaseline = prior90 >= TREND_MIN_PRIOR_INCIDENTS;
  const pct = enoughBaseline ? Math.round(((last30 - prior90PerMonth) / prior90PerMonth) * 100) : null;
  const direction: CompanionMetrics["trend"]["direction"] =
    pct == null ? "insufficient_data" : pct > 10 ? "up" : pct < -10 ? "down" : "flat";

  const sortedMetro = [...metroHazards].sort((a, b) => a - b);
  const median = sortedMetro.length ? sortedMetro[Math.floor(sortedMetro.length / 2)] : 0;
  const cityComparisonPct = median > 0 ? Math.round(((hazard - median) / median) * 100) : 0;

  const totalClassSignal = Object.values(byClass).reduce((a, b) => a + b, 0);
  const dominantClasses = Object.entries(byClass)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([cls, v]) => ({ class: cls, share: totalClassSignal > 0 ? Math.round((v / totalClassSignal) * 100) / 100 : 0 }));

  return {
    trend: { last30, prior90PerMonth: Math.round(prior90PerMonth * 10) / 10, pct, direction },
    hourHistogram,
    cityComparisonPct,
    dominantClasses,
    population: { value: population, source: population != null ? censusRelease() : "no census mapping — metro-median estimate used, confidence reduced" },
  };
}

// Compute all areas in memory (pure aside from incident fetches). Exported
// separately from persistence so the divergence report can run without DB
// write access.
export async function computeAllNSS(now: number = Date.now()): Promise<AreaComputation[]> {
  const cfg = (await loadScoringConfig()).nss;
  const areas = listAreas();
  const radius = cfg.areaRadiusMiles;

  const rows: { area: AreaDef; incidents: NssIncidentInput[]; pool: "live" | "seed" | "synth"; legacyScore: number; population: number | null }[] = [];
  for (const area of areas) {
    const live = await liveIncidentsNear(area.lat, area.lon, radius);
    const incs = incidentsNear({ lat: area.lat, lon: area.lon, radiusMiles: radius, days: cfg.horizonDays, live });
    const legacy = computeStats({ lat: area.lat, lon: area.lon, radiusMiles: radius, days: 30, live }).safetyScore;
    rows.push({
      area, incidents: incs.map(toNssInput), pool: poolKind(live, area.lat, area.lon),
      legacyScore: legacy, population: populationForArea(area.areaKey).population,
    });
  }

  // Areas without census coverage get the metro-MEDIAN population as an
  // ESTIMATED divisor: hazard units stay comparable across the percentile
  // distribution (mixing per-capita and per-area hazards would rank unmapped
  // areas artificially dangerous), while confidence keeps the fallback
  // penalty (populationEstimated flag).
  const known = rows.map((r) => r.population).filter((p): p is number => p != null).sort((a, b) => a - b);
  const medianPop = known.length ? known[Math.floor(known.length / 2)] : null;

  // pass 1: hazards for the metro distribution; pass 2: full result w/ percentile
  const { computeHazard } = await import("./nss");
  const areaSqMiles = Math.PI * radius * radius;
  const ctxOf = (r: (typeof rows)[number]) => ({
    lat: r.area.lat, lon: r.area.lon, areaSqMiles,
    population: r.population ?? medianPop,
    populationEstimated: r.population == null && medianPop != null,
  });
  const hazards = rows.map((r) => computeHazard(r.incidents, ctxOf(r), cfg, now).hazard);

  return rows.map((r, idx) => {
    const metro = hazards.filter((_, i) => i !== idx); // rank against the OTHER areas
    const result = computeNSS(
      r.incidents,
      { ...ctxOf(r), coverageFactor: cfg.coverageFactors[r.pool] ?? 0.5 },
      metro,
      cfg,
      now,
    );
    return {
      area: r.area,
      pool: r.pool,
      legacyScore: r.legacyScore,
      result,
      companion: companionMetrics(r.incidents, result.hazard, result.explanation.byClass, hazards, r.population, now),
    };
  });
}

// Recompute + persist. Used by the scheduled cron and the post-ingest hook.
export async function recomputeAndPersistNSS(now: number = Date.now()): Promise<{ areas: number; persisted: number; errors: number }> {
  const computations = await computeAllNSS(now);
  const { serverDb } = await import("@/lib/payments/serverdb"); // neutral DB client (see header)
  const db = serverDb(true);
  let persisted = 0, errors = 0;

  for (const c of computations) {
    const row = {
      area_key: c.area.areaKey,
      area_kind: c.area.areaKind,
      score: c.result.score,
      score_low: c.result.scoreLow,
      score_high: c.result.scoreHigh,
      hazard: c.result.hazard,
      confidence: c.result.confidence,
      explanation: c.result.explanation,
      companion: c.companion,
      version: c.result.explanation.version,
      computed_at: new Date(now).toISOString(),
    };
    const { error: upErr } = await db.from("area_scores").upsert(row, { onConflict: "area_key,area_kind" });
    const { error: histErr } = await db.from("area_score_history").insert({
      area_key: row.area_key, area_kind: row.area_kind, score: row.score,
      score_low: row.score_low, score_high: row.score_high,
      hazard: row.hazard, confidence: row.confidence, version: row.version, computed_at: row.computed_at,
    });
    if (upErr || histErr) errors++; else persisted++;
  }
  return { areas: computations.length, persisted, errors };
}

// Old-vs-new divergence table for Billy's cutover review (Phase 4 deliverable).
export function divergenceTable(computations: AreaComputation[]) {
  return computations.map((c) => {
    const nss = c.result.score ?? Math.round((c.result.scoreLow + c.result.scoreHigh) / 2);
    return {
      area: c.area.areaKey,
      pool: c.pool,
      legacy: c.legacyScore,
      nss,
      display: c.result.score != null ? String(c.result.score) : `${c.result.scoreLow}–${c.result.scoreHigh} (range)`,
      delta: nss - c.legacyScore,
      confidence: c.result.confidence,
      pop: c.companion.population.value ?? "—",
    };
  });
}
