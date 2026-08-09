-- ═══════════════════════════════════════════════════════════════════
-- Tri-county launch sources (Miami-Dade · Broward · Palm Beach)
--
-- What VERIFIED live on 2026-08-07 and is registered ENABLED here:
--   • NWS active-alert feeds for all three county zones — real-time
--     hazard/weather coverage for every one of the 103 launch cities.
--   • Miami-Dade jail bookings (ArcGIS, official, daily).
--
-- What was searched for and DOES NOT EXIST as open data (so is not here):
--   incident-level crime feeds from FLPD, BSO, PBSO, Boca Raton, West Palm
--   Beach and the other tri-county agencies. They publish through LexisNexis
--   Community Crime Map / CityProtect dashboards, which have no public API.
--   This mirrors the earlier Miami-Dade finding (see DATA-SOURCES.md).
--   Crime-tier coverage for the metro comes from the Citizen feed —
--   REGISTERED BUT DISABLED pending the legal review Billy owns — plus
--   community reports (tier 2) everywhere.
--
-- Idempotent: guarded on name, safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

insert into public.data_sources (name, kind, url, config, audience, enabled)
select v.name, v.kind, v.url, v.config::jsonb, 'public', v.enabled
from (values
  ('NWS Alerts — Miami-Dade County', 'nws',
   'https://api.weather.gov/alerts/active?zone=FLC086', '{}', true),
  ('NWS Alerts — Broward County', 'nws',
   'https://api.weather.gov/alerts/active?zone=FLC011', '{}', true),
  ('NWS Alerts — Palm Beach County', 'nws',
   'https://api.weather.gov/alerts/active?zone=FLC099', '{}', true),
  ('Miami-Dade Jail Bookings (official)', 'arcgis',
   'https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/miamidade_jail_data/FeatureServer/0',
   '{"typeField":"ChargeDescription","dateField":"BookDate","addressField":"Location1"}', true)
) as v(name, kind, url, config, enabled)
where not exists (select 1 from public.data_sources d where d.name = v.name);
