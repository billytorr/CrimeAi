// On-demand NSS for an ARBITRARY point (the cutover path).
//
// The daily job scores the known areas and stores their hazards; this module
// scores wherever the user actually is, ranking against that stored metro
// distribution. This is what makes the new NSS usable as THE Safety Score
// everywhere the old one was — including nationwide lookups.
//
// The legacy computeStats formula (lib/data.ts) is NOT removed; it still
// computes and is returned as `legacySafetyScore` for comparison/debugging.
//
// Boundary (Rule 2): imports the pure NSS + census + neutral DB client only —
// never entitlement, billing, or gamification code.

import { computeNSS, type NssIncidentInput, type NssResult } from "./nss";
import { loadScoringConfig } from "./config";
import { populationForArea } from "./census";
import { listAreas } from "./service";
import { milesApart } from "./geo";
import type { Incident } from "@/lib/types";

let metroCache: { at: number; hazards: number[] } | null = null;
const METRO_TTL_MS = 10 * 60_000;
export function _resetMetroCache() { metroCache = null; }

// The metro hazard distribution the percentile ranks against.
//
// CRITICAL: an empty distribution must THROW, never be used. percentileRank
// returns 0.5 on an empty set, which would silently publish "50" as every
// area's Safety Score — a confident, wrong, public-safety number. Throwing
// makes the caller fail soft to the legacy score instead. Empty results are
// also never cached, so a transient DB blip can't poison 10 minutes of scores.
async function metroHazards(): Promise<number[]> {
  if (metroCache && Date.now() - metroCache.at < METRO_TTL_MS) return metroCache.hazards;
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(false); // area_scores is world-readable
  const { data, error } = await db.from("area_scores").select("hazard").eq("area_kind", "neighborhood");
  if (error) throw new Error(`metro distribution unavailable: ${error.message}`);
  const hazards = (data || []).map((r: any) => Number(r.hazard)).filter((h: number) => Number.isFinite(h));
  if (hazards.length < 2) throw new Error("metro distribution too small to rank against");
  metroCache = { at: Date.now(), hazards };
  return hazards;
}

// Population for an arbitrary point: use the nearest known area's census
// figure when we're plausibly inside it, else the metro median as an
// ESTIMATED divisor (keeps hazard units comparable; confidence stays lowered).
function populationNear(lat: number, lon: number): { population: number | null; estimated: boolean } {
  const areas = listAreas().map((a) => ({ a, d: milesApart(lat, lon, a.lat, a.lon) })).sort((x, y) => x.d - y.d);
  const nearest = areas[0];
  if (nearest && nearest.d <= 2) {
    const p = populationForArea(nearest.a.areaKey).population;
    if (p) return { population: p, estimated: false };
  }
  const known = areas.map(({ a }) => populationForArea(a.areaKey).population).filter((p): p is number => p != null).sort((x, y) => x - y);
  const median = known.length ? known[Math.floor(known.length / 2)] : null;
  return { population: median, estimated: median != null };
}

export interface PointNss extends NssResult {
  /** what the UI should print: a number, or a range when confidence is low */
  display: string;
  /** true when confidence is too low for a point value */
  isRange: boolean;
}

function toNssInput(i: Incident): NssIncidentInput {
  return { category: i.category, source: i.source, occurredAt: i.occurred_at, lat: i.lat, lon: i.lon, userId: null };
}

// poolKind mirrors the data-source selection so coverage confidence is honest.
export async function computeNSSForPoint(opts: {
  lat: number; lon: number; radiusMiles: number;
  incidents: Incident[];
  pool: "live" | "seed" | "synth";
  now?: number;
}): Promise<PointNss> {
  const cfg = (await loadScoringConfig()).nss;
  const now = opts.now ?? Date.now();
  const { population, estimated } = populationNear(opts.lat, opts.lon);
  const areaSqMiles = Math.PI * opts.radiusMiles * opts.radiusMiles;

  const result = computeNSS(
    opts.incidents.map(toNssInput),
    {
      lat: opts.lat, lon: opts.lon, areaSqMiles,
      population, populationEstimated: estimated,
      coverageFactor: cfg.coverageFactors[opts.pool] ?? 0.5,
    },
    await metroHazards(),
    cfg,
    now,
  );

  const isRange = result.score == null;
  return {
    ...result,
    isRange,
    display: isRange ? `${result.scoreLow}–${result.scoreHigh}` : String(result.score),
  };
}
