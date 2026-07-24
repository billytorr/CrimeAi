// Sync engine: pulls every enabled data source, normalizes records to
// the CrimeAI taxonomy, and upserts into live_incidents (idempotent on
// incident_id). Runs from /api/ingest/sync — daily via Vercel cron and
// on demand from Command Center → Sources → "Sync now".
import { serverDb } from "@/lib/payments/serverdb";
import { categorize, type RawIncident } from "./normalize";
import { fetchArcgis, fetchSocrata, fetchGeojson, fetchNws, fetchCitizen } from "./adapters";

const ADAPTERS: Record<string, (url: string, conf: any) => Promise<RawIncident[]>> = {
  arcgis: fetchArcgis,
  socrata: fetchSocrata,
  geojson: fetchGeojson,
  nws: fetchNws,
  citizen: fetchCitizen,
};

export interface SyncResult {
  source: string;
  ok: boolean;
  fetched: number;
  upserted: number;
  error?: string;
}

export async function syncAllSources(): Promise<SyncResult[]> {
  const db = serverDb(true); // service role — the only writer of live_incidents
  const { data: sources, error } = await db.from("data_sources").select("*").eq("enabled", true);
  if (error) throw new Error(error.message);

  const results: SyncResult[] = [];
  for (const src of sources || []) {
    const adapter = ADAPTERS[src.kind];
    if (!adapter) {
      results.push({ source: src.name, ok: false, fetched: 0, upserted: 0, error: `Unknown kind '${src.kind}'` });
      continue;
    }
    try {
      const raw = await adapter(src.url, src.config || {});
      const rows = raw.map((r) => {
        const norm = r.categoryOverride
          ? { category: r.categoryOverride, severity: r.severityOverride ?? 2 }
          : categorize(r.type);
        return {
          incident_id: `${src.kind}-${src.id.slice(0, 8)}-${r.externalId}`,
          source_id: src.id,
          source: src.kind,
          source_label: src.name,
          verified: r.verified ?? true,
          category: norm.category,
          type: r.type.slice(0, 120),
          neighborhood: r.neighborhood || "",
          block: r.block || "",
          lat: r.lat,
          lon: r.lon,
          occurred_at: r.occurredAt,
          reported_at: r.reportedAt || r.occurredAt,
          severity: r.severityOverride ?? norm.severity,
          confidence: 0.95,
          ingested_at: new Date().toISOString(),
        };
      });

      // chunked idempotent upserts
      let upserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error: upErr } = await db.from("live_incidents").upsert(chunk, { onConflict: "incident_id" });
        if (upErr) throw new Error(upErr.message);
        upserted += chunk.length;
      }
      await db.from("data_sources").update({
        last_sync: new Date().toISOString(), last_count: upserted, last_error: null,
      }).eq("id", src.id);
      results.push({ source: src.name, ok: true, fetched: raw.length, upserted });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      await db.from("data_sources").update({ last_sync: new Date().toISOString(), last_error: msg }).eq("id", src.id);
      results.push({ source: src.name, ok: false, fetched: 0, upserted: 0, error: msg });
    }
  }

  // prune anything older than 90 days so the table stays lean
  await db.from("live_incidents").delete().lt("occurred_at", new Date(Date.now() - 90 * 86400000).toISOString());
  return results;
}
