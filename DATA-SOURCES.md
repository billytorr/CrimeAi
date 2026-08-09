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

## Tri-county launch coverage (2026-08-07)

Launch focus is every incorporated municipality in Miami-Dade (34),
Broward (30) and Palm Beach (39) — 103 cities, list in
`data/tricounty-cities.json` (Census centroids), resolution in
`lib/gazetteer.ts`. **Focus, not a fence**: anywhere else in the US still
resolves through the network geocoder.

| Layer | Coverage | Status |
|---|---|---|
| NWS hazard/weather alerts | all 103 cities (3 county zones) | ✅ live — verified + registered enabled (`sources-tricounty.sql`) |
| Miami-Dade jail bookings | Miami-Dade | ✅ live — registered enabled |
| Citizen real-time (Miami metro) | most of tri-county population | ⏸ registered DISABLED — pending the legal review Billy owns; this is the single switch that adds real-time crime coverage |
| Community reports | everywhere | ✅ tier 2 |
| PSCC demo model | everywhere | tier-3 fallback, labelled |

**Searched 2026-08-07 and confirmed absent:** incident-level open-data crime
feeds from FLPD, BSO, PBSO, Boca Raton PD and West Palm Beach PD. All publish
through LexisNexis Community Crime Map / CityProtect dashboards — no public
API, same finding as Miami-Dade below. Re-check quarterly via the runbook at
the bottom of this file; anything found gets registered in Command Center →
Sources with zero code changes.

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

## Source directory — TESTED July 2026

Every endpoint below was actually fetched and verified (or verified dead).

### Registered in Command Center now
- **NWS Weather Alerts (FL)** — ✅ ENABLED, syncing.
  `api.weather.gov/alerts/active?area=FL`. Official, free, no key
  (descriptive User-Agent required). Zone-based alerts are pinned at
  zone centroids under the "Other" category.
- **Citizen real-time (Miami metro)** — ⏸ REGISTERED BUT DISABLED,
  pending a business/legal decision.
  `citizen.com/api/incident/trending?lowerLatitude=…&fullResponse=true&limit=200`
  Returns the same live 911-derived incident stream Citizen's own app
  shows for Miami — titles, lat/lon, timestamps, severity, responsible
  PD, even ShotSpotter detections. Minutes-fresh, no auth. **BUT it is
  an unofficial, undocumented API and Citizen's ToS does not authorize
  third-party use** — it can break or be blocked at any time and using
  a direct competitor's private API carries obvious risk. Have counsel
  look before enabling. One click in Sources turns it on.

### Official but limited (tested)
- **Miami-Dade Jail Bookings** (ArcGIS, official, daily) —
  `services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/miamidade_jail_data/FeatureServer/0`
  Every county arrest since 2015 with charges. **Do NOT map it**: it has
  no offense coordinates — the only address is the *defendant's home*,
  and pinning arrestees' homes in a public app is a privacy disaster.
  Future use: aggregate charge trends for CrimeAI context only.
- **FBI Crime Data Explorer** — `api.usa.gov/crime/fbi/cde/…` with a free
  api.data.gov key. Aggregate monthly rates per agency, no incidents/no
  coordinates. Future use: "robberies here are down 8% this year" context
  in CrimeAI answers.
- **GDELT news API** — `api.gdeltproject.org/api/v2/doc/doc?query=…` —
  free local crime-news articles (rate limit: 1 request/5s). Future use:
  the news layer in CrimeAI chat, not map pins.

### Confirmed dead ends (do not chase again)
- **MDSO Crime Data Dashboard** — it's a Power BI Gov embed, NOT ArcGIS.
  No public API behind it; internals return aggregates only.
- **Miami-Dade + City of Miami open-data hubs** — searched exhaustively:
  no incident-level crime layer exists on either. Only boundaries, jail
  bookings, and police-accountability data. The county deliberately
  routes the public to crimemapping.com and Power BI.
- **crimemapping.com / LexisNexis Community Crime Map** — browser-only,
  WAF-protected, ToS-prohibited. The data partnership route is a
  business-development conversation with CentralSquare / LexisNexis.
- **Miami Beach / Coral Gables / Hialeah** — no incident-level open data.
- **opendata.miamidade.gov (Socrata)** — decommissioned (404).

### Paid / partner options
- **SpotCrime** — API exists (`api.spotcrime.com`), keys are
  partner-only; contact SpotCrime for licensing.
- **CrimeoMeter** — paid incident API by lat/lon radius.
- **CentralSquare / LexisNexis** — the two vendors that actually hold
  agency-fed incident data for South Florida; partnership = the durable
  official pipeline, worth pursuing once funded.
- **Police scanners (Broadcastify) + speech-to-text** — the build-your-own
  Citizen route; a future dedicated ingest worker (this is also the
  backbone of the police-units path).

### Finding an ArcGIS feed behind a government dashboard
Many agency dashboards elsewhere in Florida ARE ArcGIS apps reading a
public FeatureServer (Miami-Dade's is not, but expansion cities' often are):
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
