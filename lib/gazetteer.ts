// Tri-county launch gazetteer — every incorporated municipality in
// Miami-Dade (34), Broward (30) and Palm Beach (39), 103 in all.
//
// Centroids come from the US Census Bureau 2024 places gazetteer, not from
// hand-typed coordinates — 103 eyeballed lat/lons would hide at least one
// transposition, and a wrong centroid mislabels every alert in that city.
//
// This is the LAUNCH FOCUS list, not a fence. Anywhere else in the country
// still resolves through the network geocoder (lib/geocode.ts) — there are
// deliberately no guardrails, South Florida is just the fast path.

import cities from "@/data/tricounty-cities.json";

export interface TriCity { name: string; county: string; lat: number; lon: number }

export const TRICOUNTY_CITIES = cities as TriCity[];

const byName = new Map(TRICOUNTY_CITIES.map((c) => [c.name.toLowerCase(), c]));

/** Exact (case-insensitive) municipality lookup. */
export const findCity = (name: string): TriCity | undefined =>
  byName.get(name.trim().toLowerCase());

/** First municipality whose name appears in the query string. */
export function cityInQuery(query: string): TriCity | undefined {
  const q = query.toLowerCase();
  // Longest names first so "North Miami Beach" wins over "North Miami",
  // which wins over "Miami".
  for (const c of [...TRICOUNTY_CITIES].sort((a, b) => b.name.length - a.name.length)) {
    if (q.includes(c.name.toLowerCase())) return c;
  }
  return undefined;
}

const milesBetween = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
  const R = 3959, dLat = ((bLat - aLat) * Math.PI) / 180, dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/**
 * Nearest municipality to a point, if it is plausibly IN that municipality.
 *
 * 8 miles, not the 30 the old Miami-only snap used: tri-county cities are
 * dense (some under a mile across), and a 30-mile net is how Fort Lauderdale
 * users were getting labelled as Miami. Beyond 8 miles the caller should
 * trust the geocoder's own naming instead of ours.
 */
export function nearestCity(lat: number, lon: number, maxMiles = 8): TriCity | null {
  let best: TriCity | null = null, bestD = Infinity;
  for (const c of TRICOUNTY_CITIES) {
    const d = milesBetween(lat, lon, c.lat, c.lon);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best && bestD <= maxMiles ? best : null;
}
