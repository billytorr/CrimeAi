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
import type { Incident } from "@/lib/types";

const AREA_RADIUS_MILES = 1; // matches the legacy score's default radius for comparability

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

export interface AreaComputation {
  area: AreaDef;
  result: NssResult;
  legacyScore: number;      // old computeStats safetyScore on the same spot (30d window)
  pool: "live" | "seed" | "synth";
}

// Compute all areas in memory (pure aside from incident fetches). Exported
// separately from persistence so the divergence report can run without DB
// write access.
export async function computeAllNSS(now: number = Date.now()): Promise<AreaComputation[]> {
  const cfg = (await loadScoringConfig()).nss;
  const areas = listAreas();

  const rows: { area: AreaDef; incidents: NssIncidentInput[]; pool: "live" | "seed" | "synth"; legacyScore: number }[] = [];
  for (const area of areas) {
    const live = await liveIncidentsNear(area.lat, area.lon, AREA_RADIUS_MILES);
    const incs = incidentsNear({ lat: area.lat, lon: area.lon, radiusMiles: AREA_RADIUS_MILES, days: cfg.horizonDays, live });
    const legacy = computeStats({ lat: area.lat, lon: area.lon, radiusMiles: AREA_RADIUS_MILES, days: 30, live }).safetyScore;
    rows.push({ area, incidents: incs.map(toNssInput), pool: poolKind(live, area.lat, area.lon), legacyScore: legacy });
  }

  // pass 1: hazards for the metro distribution; pass 2: full result w/ percentile
  const { computeHazard } = await import("./nss");
  const areaSqMiles = Math.PI * AREA_RADIUS_MILES * AREA_RADIUS_MILES;
  const hazards = rows.map((r) =>
    computeHazard(r.incidents, { lat: r.area.lat, lon: r.area.lon, areaSqMiles }, cfg, now).hazard,
  );

  return rows.map((r, idx) => ({
    area: r.area,
    pool: r.pool,
    legacyScore: r.legacyScore,
    result: computeNSS(
      r.incidents,
      { lat: r.area.lat, lon: r.area.lon, areaSqMiles, coverageFactor: cfg.coverageFactors[r.pool] ?? 0.5 },
      hazards.filter((_, i) => i !== idx), // rank against the OTHER areas
      cfg,
      now,
    ),
  }));
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
    };
  });
}
