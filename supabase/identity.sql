-- Gamification Phase 6: identity trust subsystem (ADDITIVE).
-- Rule 4 (non-negotiable): NO column in this schema can hold biometric or ID
-- document data. We store ONLY: level, factor booleans, vendor reference id,
-- timestamps, expiry, pass/fail. Never: any biometric/document capture or
-- derived vector, government numbers, or age beyond an over-18 boolean.
-- A CI test scans column definitions to keep it that way.
--
-- Rule 3/4: identity level NEVER gates posting, reporting, or any safety
-- feature — it is a trust WEIGHT only (consumed by Guardian scoring, Phase 7).
--
-- Reversal:
--   drop function if exists public.bump_velocity(uuid,text,int,int);
--   drop table if exists public.velocity_counters;
--   drop table if exists public.identity_events;
--   drop table if exists public.identity_status;

-- ── identity status: one row per user ───────────────────────────────
create table if not exists public.identity_status (
  user_id          uuid primary key references auth.users on delete cascade,
  level            int  not null default 0 check (level between 0 and 4),
  email_verified   boolean not null default false,
  phone_verified   boolean not null default false,   -- L1 (needs Twilio Verify — dormant)
  device_attested  boolean not null default false,   -- L2 (needs native attestation — dormant)
  geo_consistent   boolean not null default false,   -- L2 (geo-IP vs GPS)
  over_18          boolean,                          -- the ONLY age fact we may ever hold
  vendor_ref       text,                             -- IDV vendor reference id (L3/L4) — never the document
  vendor_passed    boolean,                          -- pass/fail from the vendor
  vendor_level     int check (vendor_level in (3,4)),-- which level the vendor verified
  verified_at      timestamptz,
  expires_at       timestamptz,                      -- annual expiry for L3/L4
  updated_at       timestamptz not null default now()
);
alter table public.identity_status enable row level security;
drop policy if exists identity_status_own_read on public.identity_status;
create policy identity_status_own_read on public.identity_status for select
  using (auth.uid() = user_id or public.has_role(array['owner','admin']));
-- writes: service role only (level transitions are server-side)

-- ── append-only identity/anti-abuse event log ───────────────────────
create table if not exists public.identity_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null,   -- e.g. level_up, level_expired, fraud_signal, ring_flag, velocity_block
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists identity_events_user on public.identity_events (user_id, created_at desc);
alter table public.identity_events enable row level security;
drop policy if exists identity_events_admin_read on public.identity_events;
create policy identity_events_admin_read on public.identity_events for select
  using (public.has_role(array['owner','admin']));

-- ── velocity limits: atomic sliding-bucket counters ─────────────────
-- Cheap defense #1 (spec Layer 5 rule 7). bump_velocity() increments the
-- caller's bucket and reports whether the action exceeds the window cap —
-- one statement, race-safe (same pattern as consume_usage).
create table if not exists public.velocity_counters (
  user_id      uuid not null references auth.users on delete cascade,
  action       text not null,
  bucket_start timestamptz not null,
  count        int not null default 0,
  primary key (user_id, action, bucket_start)
);
alter table public.velocity_counters enable row level security;
-- service role only

create or replace function public.bump_velocity(
  p_user uuid, p_action text, p_window_secs int, p_max int
) returns table(allowed boolean, current_count int)
language plpgsql security definer set search_path = public as $$
declare bucket timestamptz; n int;
begin
  bucket := to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs);
  insert into velocity_counters (user_id, action, bucket_start, count)
  values (p_user, p_action, bucket, 1)
  on conflict (user_id, action, bucket_start)
  do update set count = velocity_counters.count + 1
  returning velocity_counters.count into n;
  return query select (p_max < 0 or n <= p_max), n;
end;
$$;
