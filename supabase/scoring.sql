-- Gamification Phase 4: scoring foundation schema (ADDITIVE — touches nothing
-- existing). New NSS runs IN PARALLEL with the legacy Safety Score in
-- lib/data.ts computeStats, which is untouched and still serving.
--
-- Reversal (down migration), if ever needed:
--   drop table if exists public.area_score_history;
--   drop table if exists public.area_scores;
--   drop table if exists public.scoring_config;

-- ── config: every constant from crimeai-scoring-algorithm-spec.md ───
-- Rule 9: all constants are configuration, changeable without deploy.
create table if not exists public.scoring_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.scoring_config enable row level security;
-- world-readable (methodology transparency); writes via service role / admins
drop policy if exists scoring_config_read on public.scoring_config;
create policy scoring_config_read on public.scoring_config for select using (true);
drop policy if exists scoring_config_admin_write on public.scoring_config;
create policy scoring_config_admin_write on public.scoring_config for all
  using (public.has_role(array['owner','admin']))
  with check (public.has_role(array['owner','admin']));

-- Seed values are the spec's tables, verbatim.
insert into public.scoring_config (key, value) values
  ('nss.severity_classes', '{
    "violent_armed":     {"weight": 100, "halflife_days": 120},
    "violent_unarmed":   {"weight": 60,  "halflife_days": 90},
    "sexual_offense":    {"weight": 90,  "halflife_days": 180},
    "burglary_residential": {"weight": 30, "halflife_days": 45},
    "burglary_commercial":  {"weight": 18, "halflife_days": 45},
    "motor_vehicle_theft":  {"weight": 20, "halflife_days": 30},
    "theft_from_vehicle":   {"weight": 12, "halflife_days": 30},
    "larceny_other":     {"weight": 8,   "halflife_days": 30},
    "vandalism":         {"weight": 5,   "halflife_days": 21},
    "disorder":          {"weight": 3,   "halflife_days": 14},
    "quality_of_life":   {"weight": 1,   "halflife_days": 7}
  }'::jsonb),
  ('nss.category_class_map', '{
    "violent":  "violent_armed",
    "sexual":   "sexual_offense",
    "domestic": "violent_unarmed",
    "burglary": "burglary_residential",
    "vehicle":  "theft_from_vehicle",
    "identity": "larceny_other",
    "cyber":    "quality_of_life",
    "other":    "disorder",
    "unverified": "quality_of_life"
  }'::jsonb),
  ('nss.spatial_sigma_miles', '0.5'::jsonb),
  ('nss.source_weights', '{
    "official":            1.00,
    "verified_aggregator": 0.85,
    "scanner":             0.60,
    "user_official_match": 0.85,
    "user_corroborated":   0.45,
    "user_unverified":     0.00
  }'::jsonb),
  ('nss.source_kind_map', '{
    "open_data": "official", "miamidade_open": "official", "arcgis": "official",
    "socrata": "official", "geojson": "official", "nws": "official",
    "spotcrime": "verified_aggregator", "citizen": "verified_aggregator",
    "liveuamap": "verified_aggregator", "scanner": "scanner",
    "pscc_model": "verified_aggregator",
    "nextdoor": "user_unverified", "community": "user_unverified"
  }'::jsonb),
  ('nss.caps', '{"ugc_share_max": 0.30, "single_user_share_max": 0.05}'::jsonb),
  ('nss.confidence', '{"point_display_min": 0.6, "population_saturation": 5000, "source_diversity_target": 3}'::jsonb),
  ('nss.horizon_days', '180'::jsonb),
  ('nss.coverage_factors', '{"live": 1.0, "seed": 0.9, "synth": 0.4}'::jsonb),
  ('nss.version', '"nss-v1"'::jsonb)
on conflict (key) do nothing;

-- ── score storage + explanation (Rule 10: explainable, built-in) ────
create table if not exists public.area_scores (
  area_key    text not null,              -- geohash6 cell, neighborhood slug, or ZIP
  area_kind   text not null check (area_kind in ('cell','neighborhood','zip')),
  score       numeric,                    -- 0-100, null when confidence too low for a point
  score_low   numeric,                    -- range endpoints (always populated)
  score_high  numeric,
  hazard      numeric not null,
  confidence  numeric not null,
  explanation jsonb not null,             -- full input breakdown (Rule 10)
  version     text not null,
  computed_at timestamptz not null default now(),
  primary key (area_key, area_kind)
);
create index if not exists area_scores_kind on public.area_scores (area_kind);
alter table public.area_scores enable row level security;
drop policy if exists area_scores_read on public.area_scores;
create policy area_scores_read on public.area_scores for select using (true);
-- no user write policy: service role only

-- ── score history (append-only) ─────────────────────────────────────
create table if not exists public.area_score_history (
  id          bigint generated always as identity primary key,
  area_key    text not null,
  area_kind   text not null,
  score       numeric,
  score_low   numeric,
  score_high  numeric,
  hazard      numeric not null,
  confidence  numeric not null,
  version     text not null,
  computed_at timestamptz not null default now()
);
create index if not exists ash_area on public.area_score_history (area_key, area_kind, computed_at desc);
alter table public.area_score_history enable row level security;
drop policy if exists ash_read on public.area_score_history;
create policy ash_read on public.area_score_history for select using (true);
