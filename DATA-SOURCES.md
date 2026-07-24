# CrimeAI Data Sources — Operations & Integration Guide

CrimeAI's intelligence layer merges three tiers of data, in strict priority
order:

| Tier | What | Trust |
|---|---|---|
| 1. **Live ingested feeds** | Real records pulled from official/public APIs into `live_incidents` | Highest — replaces everything below wherever it exists |
| 2. **Community reports** | Reports users file in the app (posts with `kind='report'`) | Shown as unverified community reports |
| 3. **Demo fallback** | Miami: curated seed · elsewhere: deterministic "PSCC crime model" | Demo/beta scaffolding only — used ONLY when tier 1 has no coverage for an area |

The moment a live source is enabled and synced for an area, the map, safety
scores, and CrimeAI chat all switch to it automatically — no code changes.

---

## Architecture

```
 Command Center → Sources          (register feeds, enable, monitor, sync now)
        │  writes data_sources
        ▼
 /api/ingest/sync                  (daily Vercel cron 9:00 UTC + manual)
        │  lib/ingest/sync.ts
        │    adapter per feed kind (lib/ingest/adapters.ts)
        │    → RawIncident[] → categorize() (lib/ingest/normalize.ts)
        ▼
 live_incidents (Supabase)         idempotent upserts, 90-day retention
        │
        ▼
 liveIncidentsNear()  (lib/ingest/live.ts)
        │  merged by incidentsNear() in lib/data.ts (live replaces demo when ≥3 records nearby)
        ▼
 ┌────────────────┬──────────────────┬────────────────────┐
 │ Crime Map      │ CrimeAI chat     │ Safety scores /    │
 │ /api/incidents │ /api/crimeai/ask │ lookup, breakdowns │
 └────────────────┴──────────────────┴────────────────────┘
```

Key files:

| File | Role |
|---|---|
| `supabase/sources.sql` | `data_sources` registry + `live_incidents` store |
| `lib/ingest/adapters.ts` | Fetch adapters: `arcgis`, `socrata`, `geojson`, `nws` |
| `lib/ingest/normalize.ts` | Offense-label → CrimeAI category mapper (keyword rules) |
| `lib/ingest/sync.ts` | Sync engine (normalize, upsert, prune, status updates) |
| `lib/ingest/live.ts` | Read path used by every API route |
| `app/api/ingest/sync` | Cron + manual sync endpoint |
| `app/api/ingest/status` | Status board for Command Center → Sources |
| `vercel.json` | Daily cron schedule |

---

## Connecting a source (Command Center → Sources)

1. Open **portal.publicsafetycrimecenter.com → Sources** (owner/admin).
2. **Add a source**: name (shown to users as the source label), kind,
   feed URL, audience, and optional field-mapping JSON.
3. Click **Sync now** — check the row for a record count or an error.
4. If the sync succeeded, click **Enable**. Done: it now refreshes daily.

### Feed kinds and their URL/config formats

**`arcgis` — ArcGIS FeatureServer/MapServer layer** (most government GIS)
- URL: the LAYER endpoint, e.g. `https://services.arcgis.com/XXXX/arcgis/rest/services/Crime/FeatureServer/0`
- Config (match the layer's field names — inspect them by opening `<layer url>?f=json`):
  ```json
  { "typeField": "offense_description", "dateField": "date_occurred",
    "idField": "case_number", "addressField": "block_address", "days": 45 }
  ```

**`socrata` — Socrata / SODA open-data dataset** (many city portals)
- URL: `https://data.<city>.gov/resource/<dataset-id>.json`
- Config: `{ "typeField": "offense", "dateField": "date", "latField": "latitude", "lonField": "longitude", "idField": "incident_number" }`
- Optional env `SOCRATA_APP_TOKEN` raises rate limits (free at dev.socrata.com).

**`geojson` — any GeoJSON FeatureCollection URL**
- Config: `{ "typeProp": "crime_type", "dateProp": "occurred", "idProp": "id" }`

**`nws` — National Weather Service alerts** (live hazards, free, no key — ships enabled)
- URL: `https://api.weather.gov/alerts/active?area=FL` (or `?point=25.77,-80.19`)
- Feeds the "Other" category with severe-weather alerts. No config needed.

### Category normalization

Raw offense labels are mapped to the CrimeAI taxonomy by keyword rules in
`lib/ingest/normalize.ts` (e.g. anything matching `BURGL|BREAK AND ENTER` →
Home Burglary; `HOMICIDE|SHOOT|ROBBERY|ASSAULT` → Violent Crime). When a new
feed uses labels the rules miss, records land in "Other" — extend the rules,
re-sync, and they reclassify on the next upsert.

---

## Source directory

### Live now
- **NWS Weather Alerts (FL)** — `api.weather.gov/alerts/active?area=FL`.
  Official, free, no key. Severe-weather/hazard alerts as map pins.

### Government open data (free — the priority pipeline)
- **Miami-Dade Sheriff's Office** — MDSO launched a Crime Data Dashboard
  (2025); the county's legacy Socrata portal migrated to ArcGIS Hub
  (`gis-mdc.opendata.arcgis.com`). The incident-level FeatureServer behind
  the dashboard is the #1 feed to wire — see "Finding an ArcGIS feed" below.
- **City of Miami** — `miami.gov/Open-APIs-Datasets` + `datahub-miamigis.opendata.arcgis.com`.
- **Neighboring cities** — Miami Beach, Coral Gables, Hialeah each publish
  open-data portals; add each as its own source row when found.
- **FBI Crime Data API** — aggregate statistics only (no incident points);
  useful later for "vs national average" context, not for map pins.

### Commercial / partner feeds (when revenue justifies)
- **SpotCrime** — licensed data partner program (contact-based pricing).
- **CrimeoMeter** — paid incident API with per-call pricing.
- **LexisNexis Community Crime Map** — powers many sheriff dashboards
  (including Miami-Dade's public map); data partnerships are contact-based.
- **Police scanners** — Broadcastify feeds + speech-to-text is the
  Citizen-style real-time layer; a future dedicated ingest worker.

### Finding an ArcGIS feed behind a government dashboard
Most agency "crime dashboards" are ArcGIS apps reading a public FeatureServer:
1. Open the dashboard in a browser → DevTools → Network tab.
2. Filter requests for `FeatureServer` or `/query?` — copy the layer URL.
3. Test it: `<layer url>/query?where=1=1&resultRecordCount=2&outFields=*&f=json`
4. Note the offense/date/geometry field names → that's your config JSON.

---

## Product paths (the `audience` field)

Every source row carries an `audience` that routes it to a product surface:

- **`public`** — the consumer CrimeAI app (map, alerts, CrimeAI chat).
- **`police`** — reserved for the police-unit monitoring desk: higher-detail
  feeds (CAD/dispatch, scanner transcripts) that should never render in the
  consumer app. The ingestion pipeline already tags them; the dedicated
  monitoring UI is a future Command Center module.
- **`newsroom`** — reserved for the news-broadcaster path: curated verified
  incidents + live streams packaged for media partners.

This means one pipeline feeds all three businesses — a source is routed by
tag, not by separate infrastructure.

## Operations notes

- **Sync cadence**: daily at 9:00 UTC (Vercel cron in `vercel.json`) + the
  Sync now button. Tighten the cron schedule as sources support it.
- **Idempotent**: incident ids are source-prefixed; re-syncs update rather
  than duplicate. 90-day retention prune runs after every sync.
- **Failure isolation**: one broken source never blocks the others; its
  error shows on its row in Command Center → Sources.
- **Security**: `live_incidents` is written ONLY by the server sync job
  (service role). `data_sources` is writable only by owner/admin (RLS).
  Optionally set `SYNC_KEY` in Vercel env to require
  `Authorization: Bearer <key>` on `/api/ingest/sync`.
- **Honesty rule**: the demo fallback tiers are labeled ("PSCC crime model")
  and CrimeAI frames non-live areas as modeled estimates. Never present
  fallback data as verified records.
