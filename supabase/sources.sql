-- ══════════════════════════════════════════════════════════════════
-- Live data-source pipeline
--   data_sources   — registry of external feeds (managed in Command
--                    Center → Sources; the sync engine reads it)
--   live_incidents — normalized ingested incidents (written ONLY by
--                    the server sync job via service role)
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

create table if not exists public.data_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'arcgis',   -- arcgis | socrata | geojson | nws | custom
  url         text not null,                    -- query endpoint (see DATA-SOURCES.md per kind)
  config      jsonb default '{}'::jsonb,        -- field mapping overrides, e.g. {"typeField":"offense","dateField":"date_occur"}
  audience    text not null default 'public',   -- public | police | newsroom  (routing paths)
  enabled     boolean default false,
  last_sync   timestamptz,
  last_count  int default 0,
  last_error  text,
  created_at  timestamptz default now(),
  updated_by  text
);
alter table public.data_sources enable row level security;
drop policy if exists sources_read on public.data_sources;
create policy sources_read on public.data_sources for select
  using (public.has_role(array['owner','admin','moderator','finance']));
drop policy if exists sources_write on public.data_sources;
create policy sources_write on public.data_sources for all
  using (public.has_role(array['owner','admin']))
  with check (public.has_role(array['owner','admin']));

create table if not exists public.live_incidents (
  incident_id  text primary key,                -- source-prefixed natural id (idempotent upserts)
  source_id    uuid references public.data_sources on delete cascade,
  source       text not null,
  source_label text not null,
  verified     boolean default true,
  category     text not null,                   -- normalized to lib/categories.ts ids
  type         text not null,
  neighborhood text default '',
  block        text default '',
  lat          double precision not null,
  lon          double precision not null,
  occurred_at  timestamptz not null,
  reported_at  timestamptz not null,
  severity     int default 2,
  confidence   double precision default 0.9,
  ingested_at  timestamptz default now()
);
create index if not exists live_inc_geo on public.live_incidents (lat, lon);
create index if not exists live_inc_time on public.live_incidents (occurred_at desc);
alter table public.live_incidents enable row level security;
drop policy if exists live_inc_read on public.live_incidents;
create policy live_inc_read on public.live_incidents for select using (true);  -- public safety data
-- writes: service role only (sync job) — no insert/update policies on purpose
