-- Gamification Phases 7+8: Guardian Score + Watch Points + Protector flip.
-- ADDITIVE. Guardian Score is REPUTATION (engagement may move it, payment
-- never does); Watch Points are a NON-TRANSFERABLE, NON-CASHABLE currency.
--
-- Reversal:
--   drop table if exists public.guardian_scores;
--   drop table if exists public.guardian_events;
--   drop table if exists public.corroborations;
--   drop table if exists public.report_verifications;
--   delete from public.scoring_config where key like 'gs.%';

-- ── report verification pipeline: unverified → corroborated → official ──
create table if not exists public.report_verifications (
  report_id   uuid primary key references public.posts on delete cascade,
  status      text not null default 'unverified'
              check (status in ('unverified','corroborated','official_match','rejected')),
  corroborators int not null default 0,
  resolved_at timestamptz,
  updated_at  timestamptz not null default now()
);
alter table public.report_verifications enable row level security;
drop policy if exists report_verifications_read on public.report_verifications;
create policy report_verifications_read on public.report_verifications for select using (true);

create table if not exists public.corroborations (
  id          bigint generated always as identity primary key,
  report_id   uuid not null references public.posts on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  unique (report_id, user_id)           -- one corroboration per user per report
);
alter table public.corroborations enable row level security;
drop policy if exists corroborations_read on public.corroborations;
create policy corroborations_read on public.corroborations for select using (true);
drop policy if exists corroborations_insert_own on public.corroborations;
create policy corroborations_insert_own on public.corroborations for insert
  with check (auth.uid() = user_id);

-- ── guardian_events: THE append-only earning/penalty ledger ─────────
-- Rule 8/11: points VEST — every earning is pending until its verification
-- window closes; settlement flips status, never rewrites amounts.
-- Rule (Watch Points): non-transferable — there is no transfer kind, rows are
-- immutable (trigger below), and every row belongs to exactly one user.
create table if not exists public.guardian_events (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users on delete cascade,
  kind          text not null check (kind in (
                  'report','corroboration','context','conversation','streak',
                  'penalty_false_report','penalty_retraction','penalty_flag','penalty_duplicate_account',
                  'protector_grant'
                )),
  gs_value      numeric not null default 0,   -- Guardian Score contribution (may be negative for penalties)
  watch_points  int not null default 0,       -- Watch Points earned (never negative, never transferable)
  status        text not null default 'pending' check (status in ('pending','settled','rejected')),
  vests_at      timestamptz,                  -- when the verification window closes
  ref_report_id uuid,                         -- source report, when applicable
  detail        jsonb,
  created_at    timestamptz not null default now(),
  settled_at    timestamptz,
  check (watch_points >= 0)
);
create index if not exists guardian_events_user on public.guardian_events (user_id, status, created_at desc);
create index if not exists guardian_events_vesting on public.guardian_events (status, vests_at);
alter table public.guardian_events enable row level security;
drop policy if exists guardian_events_own_read on public.guardian_events;
create policy guardian_events_own_read on public.guardian_events for select
  using (auth.uid() = user_id or public.has_role(array['owner','admin']));
-- writes: service role only

-- SCHEMA-LEVEL immutability: the ledger is append-only. Settlement may ONLY
-- flip status/settled_at — amounts, owner, and kind can never change, rows
-- can never be deleted. This (plus the kind whitelist above, which contains
-- no transfer kind) makes user-to-user transfer structurally impossible.
create or replace function public.guardian_ledger_guard() returns trigger
language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'guardian_events is append-only';
  end if;
  if NEW.user_id is distinct from OLD.user_id
     or NEW.gs_value is distinct from OLD.gs_value
     or NEW.watch_points is distinct from OLD.watch_points
     or NEW.kind is distinct from OLD.kind
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'guardian_events rows are immutable (only status/settled_at may change)';
  end if;
  return NEW;
end;
$$;
drop trigger if exists guardian_events_immutable on public.guardian_events;
create trigger guardian_events_immutable
  before update or delete on public.guardian_events
  for each row execute function public.guardian_ledger_guard();

-- ── computed score snapshot (recomputed from the ledger) ────────────
create table if not exists public.guardian_scores (
  user_id         uuid primary key references auth.users on delete cascade,
  score           numeric not null default 0,   -- 0-1000
  tier            text not null default 'neighbor',
  verified_count  int not null default 0,
  rejected_count  int not null default 0,
  gs_pending      numeric not null default 0,
  gs_settled      numeric not null default 0,
  watch_pending   int not null default 0,
  watch_settled   int not null default 0,
  last_active_at  timestamptz,
  explanation     jsonb,
  computed_at     timestamptz not null default now()
);
alter table public.guardian_scores enable row level security;
drop policy if exists guardian_scores_read on public.guardian_scores;
create policy guardian_scores_read on public.guardian_scores for select using (true);

-- ── Guardian scoring configuration (Rule 9: all constants config) ───
insert into public.scoring_config (key, value) values
  ('gs.report_base', '{
    "violent_armed": 40, "violent_unarmed": 30, "sexual_offense": 35,
    "burglary_residential": 20, "burglary_commercial": 15,
    "motor_vehicle_theft": 15, "theft_from_vehicle": 12, "larceny_other": 10,
    "vandalism": 8, "disorder": 5, "quality_of_life": 3,
    "suspicious_person": 0
  }'::jsonb),
  ('gs.zero_point_classes', '["suspicious_person"]'::jsonb),
  ('gs.corroboration_multiplier', '1.5'::jsonb),
  ('gs.earliness', '{"max_bonus": 0.5, "window_minutes": 60}'::jsonb),
  ('gs.novelty', '{"first": 1.0, "floor": 0.2, "decay_per_duplicate": 0.2}'::jsonb),
  ('gs.conversation', '{"per_net_upvote": 1, "daily_cap": 10, "diminishing_after": 5}'::jsonb),
  ('gs.streak', '{"per_day": 2, "cap": 60, "forgive_missed_days": 1}'::jsonb),
  ('gs.accuracy_prior', '{"alpha": 2, "beta": 2, "clamp_min": 0.1, "clamp_max": 1.0}'::jsonb),
  ('gs.identity_multipliers', '{"0": 0.25, "1": 0.5, "2": 0.75, "3": 1.0, "4": 1.25}'::jsonb),
  ('gs.penalties', '{"false_report_multiplier": 3, "retraction_multiplier": 0.5, "flag_upheld": 50, "penalty_decay_rate_factor": 0.5}'::jsonb),
  ('gs.decay', '{"halflife_days": 90, "floor": 0.6}'::jsonb),
  ('gs.daily_caps', '{"report_events": 10, "corroboration_events": 15, "context_events": 10}'::jsonb),
  ('gs.vesting_window_hours', '72'::jsonb),
  ('gs.tiers', '[
    {"name": "neighbor", "min": 0,   "identity_level": 0},
    {"name": "watcher",  "min": 100, "identity_level": 1},
    {"name": "guardian", "min": 300, "identity_level": 2},
    {"name": "sentinel", "min": 600, "identity_level": 3},
    {"name": "captain",  "min": 900, "identity_level": 4, "manual_approval": true}
  ]'::jsonb),
  ('gs.flip_grants', '{"guardian": 1, "sentinel": 3, "captain": 12, "captain_renewing": true}'::jsonb),
  ('gs.watch_points_per_gs', '1'::jsonb),
  ('gs.corroboration_factor', '{"unverified": 0.0, "corroborated": 0.6, "official_match": 1.0}'::jsonb)
on conflict (key) do nothing;
