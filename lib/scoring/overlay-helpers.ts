// Small helpers shared by the routes that overlay the NSS onto AreaStats.
// Kept separate so the routes stay readable and the pool/horizon rules live
// in one place.

import { incidentsNear, insideMiamiCoverage } from "@/lib/data";
import { loadScoringConfig } from "./config";
import type { Incident } from "@/lib/types";

export { withNSS } from "./overlay";

// Which data pool is serving this point — drives the confidence coverage
// factor. Mirrors the selection inside lib/data.ts incidentsNear.
export function poolFor(live: Incident[], lat: number, lon: number): "live" | "seed" | "synth" {
  if (live.length >= 3) return "live";
  return insideMiamiCoverage(lat, lon) ? "seed" : "synth";
}

// The NSS scores over its own configured horizon (per-class decay handles
// age), NOT the caller's display window — a 7-day free-tier map window must
// not make an area look safer than it is.
export async function nssIncidents(lat: number, lon: number, radiusMiles: number, live: Incident[]): Promise<Incident[]> {
  const cfg = (await loadScoringConfig()).nss;
  return incidentsNear({ lat, lon, radiusMiles, days: cfg.horizonDays, live });
}
