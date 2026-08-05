-- Gamification Phase 5: full NSS (ADDITIVE).
-- Reversal: alter table public.area_scores drop column if exists companion;
--           delete from public.scoring_config where key in
--             ('nss.area_radius_miles','nss.range_width');

-- Companion display metrics (trend, time-of-day curve, city comparison,
-- dominant classes) — NOT score inputs, display only (spec Layer 1).
alter table public.area_scores add column if not exists companion jsonb;

-- Residual constants promoted to config (flagged in the Phase 4 report):
insert into public.scoring_config (key, value) values
  ('nss.area_radius_miles', '1'::jsonb),
  ('nss.range_width', '{"slope": 25, "min": 3}'::jsonb)
on conflict (key) do nothing;
