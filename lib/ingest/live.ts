// Server-side read path: real ingested incidents near a point. When
// enough live records exist for an area they REPLACE the demo seed /
// model in every consumer (map, safety score, CrimeAI) — see
// incidentsNear's `live` option in lib/data.ts.
import { serverDb } from "@/lib/payments/serverdb";
import type { Incident } from "@/lib/types";

export async function liveIncidentsNear(lat: number, lon: number, radiusMiles: number): Promise<Incident[]> {
  try {
    const db = serverDb();
    const dLat = radiusMiles / 69 + 0.01;
    const dLon = radiusMiles / (69 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))) + 0.01;
    const { data } = await db.from("live_incidents").select("*")
      .gte("lat", lat - dLat).lte("lat", lat + dLat)
      .gte("lon", lon - dLon).lte("lon", lon + dLon)
      .order("occurred_at", { ascending: false })
      .limit(3000);
    return (data || []).map((r): Incident => ({
      incident_id: r.incident_id,
      source: r.source,
      source_label: r.source_label,
      verified: !!r.verified,
      category: r.category,
      type: r.type,
      neighborhood: r.neighborhood || "",
      block: r.block || "",
      lat: r.lat,
      lon: r.lon,
      occurred_at: r.occurred_at,
      reported_at: r.reported_at,
      severity: r.severity ?? 2,
      confidence: r.confidence ?? 0.9,
      corroborating_sources: [],
    }));
  } catch {
    return []; // live layer down → callers fall back to seed/model
  }
}
