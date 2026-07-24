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
// Most alerts carry no polygon — they reference forecast zones instead,
// so we resolve each zone's geometry (cached per run) and pin centroids.
const NWS_HEADERS = { "User-Agent": "PSCC-CrimeAI (team@creativewolf.com)" };

function ringCentroid(ring: number[][]): { lat: number; lon: number } | null {
  if (!Array.isArray(ring) || !ring.length) return null;
  const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  return { lat, lon };
}
function geomCentroid(geom: any): { lat: number; lon: number } | null {
  if (!geom) return null;
  if (geom.type === "Polygon") return ringCentroid(geom.coordinates?.[0]);
  if (geom.type === "MultiPolygon") return ringCentroid(geom.coordinates?.[0]?.[0]);
  return null;
}

export async function fetchNws(url: string, _conf: Conf): Promise<RawIncident[]> {
  const res = await fetch(url, { headers: NWS_HEADERS, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`NWS ${res.status}`);
  const data = (await res.json()) as any;
  const out: RawIncident[] = [];
  const zoneCache = new Map<string, { lat: number; lon: number } | null>();
  let zoneFetches = 0;

  async function zoneCentroid(zoneUrl: string): Promise<{ lat: number; lon: number } | null> {
    if (zoneCache.has(zoneUrl)) return zoneCache.get(zoneUrl)!;
    if (zoneFetches >= 30) return null; // cap per sync — alerts share zones anyway
    zoneFetches++;
    try {
      const zr = await fetch(zoneUrl, { headers: NWS_HEADERS, signal: AbortSignal.timeout(15000) });
      const zj = zr.ok ? ((await zr.json()) as any) : null;
      const c = geomCentroid(zj?.geometry);
      zoneCache.set(zoneUrl, c);
      return c;
    } catch {
      zoneCache.set(zoneUrl, null);
      return null;
    }
  }

  for (const f of data.features || []) {
    const p = f.properties || {};
    // prefer the alert's own polygon; fall back to each affected zone
    const own = geomCentroid(f.geometry);
    const pins: { lat: number; lon: number; suffix: string }[] = [];
    if (own) pins.push({ ...own, suffix: "" });
    else {
      for (const z of (p.affectedZones || []).slice(0, 4)) {
        const c = await zoneCentroid(z);
        if (c) pins.push({ ...c, suffix: `-${String(z).split("/").pop()}` });
      }
    }
    for (const pin of pins) {
      out.push({
        externalId: `${String(p.id || f.id)}${pin.suffix}`,
        type: String(p.event || "Weather alert"),
        lat: pin.lat, lon: pin.lon,
        occurredAt: p.onset || p.sent || new Date().toISOString(),
        categoryOverride: "other",
        severityOverride: p.severity === "Extreme" ? 4 : p.severity === "Severe" ? 3 : 2,
        verified: true,
      });
    }
  }
  return out;
}
