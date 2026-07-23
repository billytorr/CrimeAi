import incidentsRaw from "@/data/miami-incidents.json";
import neighborhoods from "@/data/miami-neighborhoods.json";
import type { Incident, AreaStats } from "./types";

// ── Re-base timestamps to "now" ──────────────────────────────
// The seed is anchored to 2026-06-15. So the demo always shows
// "last 30 days" relative to whenever it actually runs, we shift
// every timestamp by the delta between the seed anchor and now.
const SEED_ANCHOR = Date.UTC(2026, 5, 15, 18, 0, 0);
const SHIFT = Date.now() - SEED_ANCHOR;

let _cache: Incident[] | null = null;
export function allIncidents(): Incident[] {
  if (_cache) return _cache;
  _cache = (incidentsRaw as Incident[]).map((i) => ({
    ...i,
    occurred_at: new Date(+new Date(i.occurred_at) + SHIFT).toISOString(),
    reported_at: new Date(+new Date(i.reported_at) + SHIFT).toISOString(),
  }));
  return _cache;
}

export const NEIGHBORHOODS = neighborhoods as { name: string; lat: number; lon: number }[];

// Haversine distance in miles.
export function milesBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface QueryOpts {
  lat: number;
  lon: number;
  radiusMiles?: number;
  days?: number;
  categories?: string[];
  sources?: string[];
  minSeverity?: number;
}

export function incidentsNear(opts: QueryOpts): Incident[] {
  const { lat, lon, radiusMiles = 1, days = 30, categories, sources, minSeverity } = opts;
  const cutoff = Date.now() - days * 86400000;
  return allIncidents().filter((i) => {
    if (+new Date(i.occurred_at) < cutoff) return false;
    if (categories && categories.length && !categories.includes(i.category)) return false;
    if (sources && sources.length && !sources.includes(i.source)) return false;
    if (minSeverity && i.severity < minSeverity) return false;
    return milesBetween(lat, lon, i.lat, i.lon) <= radiusMiles;
  });
}

// Severity-weighted "exposure" (sum of severities per sq mile) is what
// drives the safety score. We compare each area to the MEDIAN Miami
// neighborhood's exposure at the same radius/window, so "vs city" always
// moves with the safety score: safer-than-typical reads negative, hotter
// reads positive — no contradiction with the headline score.
function exposureAt(lat: number, lon: number, radiusMiles: number, days: number): number {
  const incs = incidentsNear({ lat, lon, radiusMiles, days });
  const area = Math.PI * radiusMiles * radiusMiles;
  return incs.reduce((s, i) => s + i.severity, 0) / area;
}

const _baselineCache = new Map<string, number>();
function meanNeighborhoodExposure(radiusMiles: number, days: number): number {
  const key = `${radiusMiles}:${days}`;
  if (_baselineCache.has(key)) return _baselineCache.get(key)!;
  const vals = NEIGHBORHOODS.map((nb) => exposureAt(nb.lat, nb.lon, radiusMiles, days));
  const mean = vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);
  _baselineCache.set(key, mean);
  return mean;
}

export function computeStats(opts: QueryOpts): AreaStats {
  const radius = opts.radiusMiles ?? 1;
  const days = opts.days ?? 30;
  const incs = incidentsNear({ ...opts, radiusMiles: radius, days });

  const byCategory: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  const sourceCounts: Record<string, { label: string; count: number }> = {};
  const hourHistogram = new Array(24).fill(0);
  let nightCount = 0;

  for (const i of incs) {
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    typeCounts[i.type] = (typeCounts[i.type] || 0) + 1;
    sourceCounts[i.source] = { label: i.source_label, count: (sourceCounts[i.source]?.count || 0) + 1 };
    const h = new Date(i.occurred_at).getHours();
    hourHistogram[h]++;
    if (h >= 21 || h <= 4) nightCount++;
  }

  const byType = Object.entries(typeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  const bySource = Object.entries(sourceCounts)
    .map(([source, v]) => ({ source, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count);

  // last7 vs prev7
  const now = Date.now();
  const last7 = incs.filter((i) => +new Date(i.occurred_at) >= now - 7 * 86400000).length;
  const prev7 = incs.filter((i) => {
    const t = +new Date(i.occurred_at);
    return t < now - 7 * 86400000 && t >= now - 14 * 86400000;
  }).length;
  const trendPct = prev7 === 0 ? (last7 > 0 ? 100 : 0) : Math.round(((last7 - prev7) / prev7) * 100);

  // Safety score: severity-weighted exposure, inverted. Tuned so quiet
  // areas land 80-95, hot areas 30-55.
  const area = Math.PI * radius * radius;
  const weighted = incs.reduce((s, i) => s + i.severity, 0);
  const exposure = weighted / area; // severity-weighted incidents per sq mile
  const safetyScore = Math.max(2, Math.min(98, Math.round(100 - exposure * 1.15)));

  // "vs typical Miami neighborhood" — same exposure metric vs the mean.
  const baseline = meanNeighborhoodExposure(radius, days) || 1;
  const cityComparisonPct = Math.round(((exposure - baseline) / baseline) * 100);

  const topCategory = byType[0]?.type ?? "—";

  return {
    total: incs.length,
    byCategory,
    byType,
    bySource,
    hourHistogram,
    nightSharePct: incs.length ? Math.round((nightCount / incs.length) * 100) : 0,
    last7,
    prev7,
    trendPct,
    safetyScore,
    cityComparisonPct,
    topCategory,
  };
}

export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
