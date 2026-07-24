// Fetch adapters — one per feed protocol. Each takes the source row's
// url + config and returns RawIncident[]. Adding a new protocol = one
// function here + a case in sync.ts. See DATA-SOURCES.md.
import type { RawIncident } from "./normalize";

type Conf = Record<string, any>;

// Web-Mercator (ArcGIS default) → WGS84
function mercToLatLon(x: number, y: number): { lat: number; lon: number } {
  const lon = (x / 20037508.34) * 180;
  const lat = (Math.atan(Math.exp(((y / 20037508.34) * 180 * Math.PI) / 180)) * 360) / Math.PI - 90;
  return { lat, lon };
}

// ── ArcGIS FeatureServer/MapServer layer query ──────────────────────
// url: https://…/FeatureServer/0  (layer URL, no /query suffix)
// config: { typeField, dateField, idField?, reportedField?, addressField?, where? }
export async function fetchArcgis(url: string, conf: Conf): Promise<RawIncident[]> {
  const typeField = conf.typeField || "offense";
  const dateField = conf.dateField || "date_occurred";
  const days = conf.days || 45;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const where = conf.where || `${dateField} >= DATE '${since}'`;
  const params = new URLSearchParams({
    where, outFields: "*", f: "json", resultRecordCount: String(conf.limit || 2000),
    orderByFields: `${dateField} DESC`, outSR: "4326",
  });
  const res = await fetch(`${url.replace(/\/query\/?$/, "")}/query?${params}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`ArcGIS ${res.status}`);
  const data = (await res.json()) as any;
  if (data.error) throw new Error(`ArcGIS: ${data.error.message}`);
  const out: RawIncident[] = [];
  for (const f of data.features || []) {
    const a = f.attributes || {};
    let lat = a[conf.latField || "latitude"] ?? a.LAT ?? a.Latitude;
    let lon = a[conf.lonField || "longitude"] ?? a.LON ?? a.Longitude;
    if ((lat == null || lon == null) && f.geometry) {
      if (typeof f.geometry.y === "number" && Math.abs(f.geometry.y) <= 90) { lat = f.geometry.y; lon = f.geometry.x; }
      else if (typeof f.geometry.y === "number") { const c = mercToLatLon(f.geometry.x, f.geometry.y); lat = c.lat; lon = c.lon; }
    }
    const when = a[dateField];
    if (lat == null || lon == null || !when) continue;
    const occurred = typeof when === "number" ? new Date(when) : new Date(when);
    if (isNaN(+occurred)) continue;
    out.push({
      externalId: String(a[conf.idField || "OBJECTID"] ?? `${lat},${lon},${+occurred}`),
      type: String(a[typeField] ?? "Incident"),
      lat: Number(lat), lon: Number(lon),
      occurredAt: occurred.toISOString(),
      reportedAt: a[conf.reportedField] ? new Date(a[conf.reportedField]).toISOString() : undefined,
      block: a[conf.addressField] ? String(a[conf.addressField]) : undefined,
      neighborhood: a[conf.areaField] ? String(a[conf.areaField]) : undefined,
    });
  }
  return out;
}

// ── Socrata (SODA 2.x) dataset ──────────────────────────────────────
// url: https://data.example.gov/resource/xxxx-xxxx.json
// config: { typeField, dateField, latField, lonField, idField?, token? }
export async function fetchSocrata(url: string, conf: Conf): Promise<RawIncident[]> {
  const dateField = conf.dateField || "date";
  const days = conf.days || 45;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19);
  const params = new URLSearchParams({
    $where: `${dateField} >= '${since}'`,
    $limit: String(conf.limit || 2000),
    $order: `${dateField} DESC`,
  });
  const headers: Record<string, string> = {};
  if (conf.token || process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = conf.token || process.env.SOCRATA_APP_TOKEN!;
  const res = await fetch(`${url}?${params}`, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Socrata ${res.status}`);
  const rows = (await res.json()) as any[];
  return rows
    .map((r): RawIncident | null => {
      const lat = parseFloat(r[conf.latField || "latitude"] ?? r.location?.latitude);
      const lon = parseFloat(r[conf.lonField || "longitude"] ?? r.location?.longitude);
      if (!isFinite(lat) || !isFinite(lon)) return null;
      return {
        externalId: String(r[conf.idField || "id"] ?? `${lat},${lon},${r[dateField]}`),
        type: String(r[conf.typeField || "offense"] ?? "Incident"),
        lat, lon,
        occurredAt: new Date(r[dateField]).toISOString(),
        block: r[conf.addressField] ? String(r[conf.addressField]) : undefined,
      };
    })
    .filter((x): x is RawIncident => !!x);
}

// ── Plain GeoJSON FeatureCollection ─────────────────────────────────
// config: { typeProp, dateProp, idProp? }
export async function fetchGeojson(url: string, conf: Conf): Promise<RawIncident[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`GeoJSON ${res.status}`);
  const data = (await res.json()) as any;
  const out: RawIncident[] = [];
  for (const f of data.features || []) {
    const [lon, lat] = f.geometry?.coordinates || [];
    const p = f.properties || {};
    const when = p[conf.dateProp || "date"];
    if (lat == null || lon == null || !when) continue;
    out.push({
      externalId: String(f.id ?? p[conf.idProp || "id"] ?? `${lat},${lon},${when}`),
      type: String(p[conf.typeProp || "type"] ?? "Incident"),
      lat, lon,
      occurredAt: new Date(when).toISOString(),
    });
  }
  return out;
}

// ── National Weather Service alerts (live hazards, no key) ─────────
// url: https://api.weather.gov/alerts/active?point=25.77,-80.19  (or ?area=FL)
export async function fetchNws(url: string, _conf: Conf): Promise<RawIncident[]> {
  const res = await fetch(url, { headers: { "User-Agent": "PSCC-CrimeAI (team@creativewolf.com)" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`NWS ${res.status}`);
  const data = (await res.json()) as any;
  const out: RawIncident[] = [];
  for (const f of data.features || []) {
    const p = f.properties || {};
    // alerts are polygons; pin at the polygon centroid when present
    let lat: number | undefined, lon: number | undefined;
    const coords = f.geometry?.coordinates?.[0];
    if (Array.isArray(coords) && coords.length) {
      lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
      lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
    }
    if (lat == null || lon == null) continue;
    out.push({
      externalId: String(p.id || f.id),
      type: String(p.event || "Weather alert"),
      lat, lon,
      occurredAt: p.onset || p.sent || new Date().toISOString(),
      categoryOverride: "other",
      severityOverride: p.severity === "Extreme" ? 4 : p.severity === "Severe" ? 3 : 2,
      verified: true,
    });
  }
  return out;
}
