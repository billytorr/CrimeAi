import { NEIGHBORHOODS } from "./data";
import type { ResolvedLocation } from "./types";

// Built-in Miami gazetteer so address resolution works with ZERO keys
// and zero network during a demo. Covers neighborhoods + common aliases
// and a few landmarks. Falls back to OpenStreetMap Nominatim (free) and
// then Mapbox (if a token is configured) for arbitrary street addresses.

const ALIASES: Record<string, string> = {
  sobe: "South Beach",
  "south beach": "South Beach",
  "miami beach": "South Beach",
  "the grove": "Coconut Grove",
  gables: "Coral Gables",
  downtown: "Downtown Miami",
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
  // direct alias / contains
  for (const [alias, name] of Object.entries(ALIASES)) {
    if (q === alias || q.includes(alias)) {
      const nb = NEIGHBORHOODS.find((n) => n.name === name);
      if (nb) return { query, lat: nb.lat, lon: nb.lon, neighborhood: nb.name, city: "Miami", state: "FL", source: "gazetteer" };
    }
  }
  // direct neighborhood name match
  for (const nb of NEIGHBORHOODS) {
    if (q.includes(nb.name.toLowerCase())) {
      return { query, lat: nb.lat, lon: nb.lon, neighborhood: nb.name, city: "Miami", state: "FL", source: "gazetteer" };
    }
  }
  // ZIP heuristics for common Miami ZIPs -> neighborhood
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
    const nb = NEIGHBORHOODS.find((n) => n.name === ZIPS[zip]);
    if (nb) return { query, lat: nb.lat, lon: nb.lon, neighborhood: nb.name, city: "Miami", state: "FL", source: "gazetteer" };
  }
  return null;
}

function nearestNeighborhood(lat: number, lon: number): string {
  let best = NEIGHBORHOODS[0];
  let bestD = Infinity;
  for (const nb of NEIGHBORHOODS) {
    const d = (nb.lat - lat) ** 2 + (nb.lon - lon) ** 2;
    if (d < bestD) { bestD = d; best = nb; }
  }
  return best.name;
}

async function fromNominatim(query: string): Promise<ResolvedLocation | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(
      query + " Miami FL"
    )}`;
    const res = await fetch(url, { headers: { "User-Agent": "PSCC-Miami/0.1 (public-safety beta)" } });
    if (!res.ok) return null;
    const data = (await res.json()) as any[];
    if (!data.length) return null;
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    return { query, lat, lon, neighborhood: nearestNeighborhood(lat, lon), city: "Miami", state: "FL", source: "nominatim" };
  } catch {
    return null;
  }
}

async function fromMapbox(query: string): Promise<ResolvedLocation | null> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query + " Miami FL"
    )}.json?limit=1&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const f = data.features?.[0];
    if (!f) return null;
    const [lon, lat] = f.center;
    return { query, lat, lon, neighborhood: nearestNeighborhood(lat, lon), city: "Miami", state: "FL", source: "mapbox" };
  } catch {
    return null;
  }
}

export async function resolveAddress(query: string): Promise<ResolvedLocation | null> {
  return (
    fromGazetteer(query) ||
    (await fromMapbox(query)) ||
    (await fromNominatim(query)) ||
    // Last resort: drop them in central Miami so the demo never dead-ends.
    null
  );
}
