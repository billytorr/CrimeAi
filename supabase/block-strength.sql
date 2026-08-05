-- Gamification Phase 9: Block Strength (ADDITIVE).
-- Measures how well-WATCHED an area is. Crime rate is explicitly NOT an
-- input (see lib/scoring/block-strength.ts + its CI test).
--
-- Reversal:
--   drop table if exists public.block_strength;
--   delete from public.scoring_config where key like 'bs.%';

create table if not exists public.block_strength (
  area_key    text primary key,
  score       numeric not null default 0,
  tier        text not null default 'dark',
  components  jsonb not null,
  explanation jsonb not null,
  next_tier   text,
  neighbors_needed int,
  computed_at timestamptz not null default now()
);
alter table public.block_strength enable row level security;
drop policy if exists block_strength_read on public.block_strength;
create policy block_strength_read on public.block_strength for select using (true);
-- writes: service role only

insert into public.scoring_config (key, value) values
  ('bs.weights', '{"coverage": 0.35, "responsiveness": 0.20, "corroboration_rate": 0.15, "temporal_coverage": 0.15, "circle_density": 0.10, "verified_share": 0.05}'::jsonb),
  ('bs.coverage_k', '25'::jsonb),
  ('bs.response_target_minutes', '15'::jsonb),
  ('bs.verified_min_level', '3'::jsonb),
  ('bs.window_days', '14'::jsonb),
  ('bs.tiers', '[
    {"name": "dark", "min": 0},
    {"name": "forming", "min": 20},
    {"name": "watched", "min": 40},
    {"name": "protected", "min": 60},
    {"name": "fortified", "min": 80}
  ]'::jsonb)
on conflict (key) do nothing;
