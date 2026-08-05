// Minimal geohash encoder (standard base32 geohash, no dependency).
// The NSS computes per geohash cell (spec suggests precision 6 ≈ 1.2km × 0.6km)
// and rolls up to neighborhood and ZIP. Pure functions only.
//
// MODULE BOUNDARY (Rule 2): no imports from entitlements/payments/gamification.

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function geohashEncode(lat: number, lon: number, precision = 6): string {
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
  let hash = "";
  let bit = 0, ch = 0, evenBit = true;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonLo + lonHi) / 2;
      if (lon >= mid) { ch = (ch << 1) | 1; lonLo = mid; } else { ch = ch << 1; lonHi = mid; }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latLo = mid; } else { ch = ch << 1; latHi = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

// Center point of a geohash cell (for distance math from a cell key).
export function geohashCenter(hash: string): { lat: number; lon: number } {
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
  let evenBit = true;
  for (const c of hash) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) throw new Error(`invalid geohash char '${c}'`);
    for (let b = 4; b >= 0; b--) {
      const bit = (idx >> b) & 1;
      if (evenBit) {
        const mid = (lonLo + lonHi) / 2;
        if (bit) lonLo = mid; else lonHi = mid;
      } else {
        const mid = (latLo + latHi) / 2;
        if (bit) latLo = mid; else latHi = mid;
      }
      evenBit = !evenBit;
    }
  }
  return { lat: (latLo + latHi) / 2, lon: (lonLo + lonHi) / 2 };
}

// Haversine miles (kept local so the scoring module stays dependency-free;
// same math as lib/data.ts milesBetween, R = 3958.8).
export function milesApart(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
