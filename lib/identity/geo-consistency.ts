// Geo-IP vs GPS consistency (cheap L2 signal). Vercel injects the request's
// IP-derived location as headers; we compare it with the location the client
// CLAIMS (their profile/report GPS). Wildly inconsistent = weight-lowering
// signal, NEVER a block (Rules 1/3).
//
// Pure comparison; header extraction kept separate for testability.

export interface GeoCheck { consistent: boolean; distanceMiles: number | null; reason: string }

const R = 3958.8;
function miles(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// IP geolocation is city-level at best; anything under `thresholdMiles` is
// consistent. Missing IP geo (localhost, some networks) = inconclusive, and
// inconclusive counts as consistent — absence of evidence must never lower
// anyone's trust (fail-open).
export function checkGeoConsistency(
  claimed: { lat: number; lon: number } | null,
  ipGeo: { lat: number; lon: number } | null,
  thresholdMiles = 100,
): GeoCheck {
  if (!claimed) return { consistent: true, distanceMiles: null, reason: "no claimed location" };
  if (!ipGeo) return { consistent: true, distanceMiles: null, reason: "no ip geolocation (inconclusive → consistent)" };
  const d = miles(claimed.lat, claimed.lon, ipGeo.lat, ipGeo.lon);
  return { consistent: d <= thresholdMiles, distanceMiles: Math.round(d * 10) / 10, reason: d <= thresholdMiles ? "within threshold" : "ip and claimed location far apart" };
}

// Extract Vercel's IP-geo headers from a request (null when absent).
export function ipGeoFromHeaders(headers: Headers): { lat: number; lon: number } | null {
  const lat = parseFloat(headers.get("x-vercel-ip-latitude") || "");
  const lon = parseFloat(headers.get("x-vercel-ip-longitude") || "");
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}
