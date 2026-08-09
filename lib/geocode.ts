import { NEIGHBORHOODS, milesBetween } from "./data";
import { cityInQuery, findCity } from "./gazetteer";
import type { ResolvedLocation } from "./types";

// Address resolution, nationwide:
//   1. Built-in Miami gazetteer — instant, zero-network fast path for the
//      beta market (neighborhoods, aliases, common ZIPs).
//   2. Mapbox (if a token is configured) — any US address.
//   3. OpenStreetMap Nominatim (free) — any US address.
// Non-Miami results carry their real city/state from the geocoder.

const ALIASES: Record<string, string> = {
  sobe: "South Beach",
  "south beach": "South Beach",
  "miami beach": "South Beach",
  "the grove": "Coconut Grove",
  gables: "Coral Gables",
  "downtown miami": "Downtown Miami",
  "the gables": "Coral Gables",
  "little havana": "Little Havana",
  calle8: "Little Havana",
  "calle ocho": "Little Havana",
  brickell: "Brickell",
  wynwood: "Wynwood",
  doral: "Doral",
  hialeah: "Hialeah",
  kendall: "Kendall",
  aventura: "Aventura",
  "key biscayne": "Key Biscayne",
  pinecrest: "Pinecrest",
  overtown: "Overtown",
  "liberty city": "Liberty City",
  "little haiti": "Little Haiti",
  allapattah: "Allapattah",
  edgewater: "Edgewater",
  "design district": "Design District",
  "north miami": "North Miami",
  "north beach": "North Beach",
  "mid beach": "Mid-Beach",
  "coral way": "Coral Way",
  flagami: "Flagami",
};

function fromGazetteer(query: string): ResolvedLocation | null {
  const q = query.toLowerCase().trim();

  // Miami NEIGHBORHOODS first, but only on an EXACT name match and only for
  // names that are not themselves municipalities — "wynwood" stays a Miami
  // neighborhood, while "coral gables" falls through to the city branch
  // below. Labelling a real city as a neighborhood of Miami was exactly the
  // launch bug: Coral Gables, Hialeah and Doral are their own cities.
  const exactNb = NEIGHBORHOODS.find((n) => q === n.name.toLowerCase());
  if (exactNb && !findCity(exactNb.name)) {
    return { query, lat: exactNb.lat, lon: exactNb.lon, neighborhood: exactNb.name, city: "Miami", state: "FL", source: "gazetteer" };
  }

  // All 103 tri-county municipalities (data/tricounty-cities.json, Census
  // centroids). Longest-name-first inside cityInQuery, so "North Miami
  // Beach" beats "North Miami" beats "Miami".
  const city = cityInQuery(q);
  if (city) {
    return { query, lat: city.lat, lon: city.lon, neighborhood: city.name, city: city.name, state: "FL", source: "gazetteer" };
  }

  for (const [alias, name] of Object.entries(ALIASES)) {
    if (q === alias || q.includes(alias)) {
      const nb = NEIGHBORHOODS.find((n) => n.name === name);
      if (nb) return { query, lat: nb.lat, lon: nb.lon, neighborhood: nb.name, city: "Miami", state: "FL", source: "gazetteer" };
    }
  }
  for (const nb of NEIGHBORHOODS) {
    if (q.includes(nb.name.toLowerCase())) {
      return { query, lat: nb.lat, lon: nb.lon, neighborhood: nb.name, city: "Miami", state: "FL", source: "gazetteer" };
    }
  }
  const zip = q.match(/\b(33\d{3})\b/)?.[1];
  const ZIPS: Record<string, string> = {
    "33139": "South Beach", "33140": "Mid-Beach", "33141": "North Beach",
    "33130": "Little Havana", "33131": "Brickell", "33132": "Downtown Miami",
    "33127": "Wynwood", "33137": "Edgewater", "33133": "Coconut Grove",
    "33134": "Coral Gables", "33146": "Coral Gables", "33125": "Allapattah",
    "33142": "Liberty City", "33136": "Overtown", "33138": "Little Haiti",
    "33178": "Doral", "33012": "Hialeah", "33156": "Pinecrest",
    "33176": "Kendall", "33160": "Aventura", "33149": "Key Biscayne",
  };
  if (zip && ZIPS[zip]) {
    // A ZIP that maps to a real municipality labels it as one.
    const zc = findCity(ZIPS[zip]);
    if (zc) return { query, lat: zc.lat, lon: zc.lon, neighborhood: zc.name, city: zc.name, state: "FL", source: "gazetteer" };
    const nb = NEIGHBORHOODS.find((n) => n.name === ZIPS[zip]);
    if (nb) return { query, lat: nb.lat, lon: nb.lon, neighborhood: nb.name, city: "Miami", state: "FL", source: "gazetteer" };
  }
  return null;
}

function nearestNeighborhood(lat: number, lon: number): string | null {
  let best = NEIGHBORHOODS[0];
  let bestD = Infinity;
  for (const nb of NEIGHBORHOODS) {
    const d = (nb.lat - lat) ** 2 + (nb.lon - lon) ** 2;
    if (d < bestD) { bestD = d; best = nb; }
  }
  // only claim a Miami neighborhood when the point is actually near one
  return milesBetween(lat, lon, best.lat, best.lon) <= 12 ? best.name : null;
}

// Full US state name → postal code (Nominatim returns full names).
const STATE_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
const abbrState = (s?: string) => (s ? STATE_ABBR[s.toLowerCase()] || s : "");

function labelParts(lat: number, lon: number, neighborhood: string, city: string, state: string) {
  // prefer the local Miami gazetteer name when the point is in our beta market
  const miamiHood = nearestNeighborhood(lat, lon);
  return {
    neighborhood: miamiHood || neighborhood || city || "Your area",
    city: miamiHood ? "Miami" : city,
    state: miamiHood ? "FL" : abbrState(state),
  };
}

async function fromNominatim(query: string): Promise<ResolvedLocation | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": "PSCC-CrimeAI/0.2 (public-safety beta)" } });
    if (!res.ok) return null;
    const data = (await res.json()) as any[];
    if (!data.length) return null;
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    const a = data[0].address || {};
    const parts = labelParts(lat, lon,
      a.neighbourhood || a.suburb || a.quarter || a.hamlet || "",
      a.city || a.town || a.village || a.county || "",
      a.state || "");
    return { query, lat, lon, ...parts, source: "nominatim" };
  } catch {
    return null;
  }
}

async function fromMapbox(query: string): Promise<ResolvedLocation | null> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&country=us&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const f = data.features?.[0];
    if (!f) return null;
    const [lon, lat] = f.center;
    const ctx: any[] = f.context || [];
    const byType = (t: string) => ctx.find((c) => String(c.id).startsWith(t))?.text || "";
    const parts = labelParts(lat, lon, byType("neighborhood") || byType("locality"), byType("place"), byType("region"));
    return { query, lat, lon, ...parts, source: "mapbox" };
  } catch {
    return null;
  }
}

export async function resolveAddress(query: string): Promise<ResolvedLocation | null> {
  return (
    fromGazetteer(query) ||
    (await fromMapbox(query)) ||
    (await fromNominatim(query)) ||
    null
  );
}
