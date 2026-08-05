-- Phase 2C: minimal backends for the remaining tier capabilities.
--   • saved_locations table + atomic, race-safe limited insert
--   • effective_plan_of(): plan resolution in SQL (mirrors effectivePlan)
--   • profiles trigger: server-authoritative clamps for trusted_circle size
--     and alert channels (CLAMPS, never raises — a save must never fail into
--     nothing; over-limit data is trimmed to the plan's allowance)
-- All enforcement here honors the kill switch (enforcement_flags.default).
-- NOTHING in this file touches safety paths: SOS/dispatch does not write
-- profiles.contacts or read any of these objects.

-- ── saved locations ─────────────────────────────────────────────────
create table if not exists public.saved_locations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  label        text not null default '',
  address      text not null,
  lat          double precision,
  lon          double precision,
  neighborhood text,
  created_at   timestamptz not null default now()
);
create index if not exists saved_locations_user on public.saved_locations (user_id);
alter table public.saved_locations enable row level security;
drop policy if exists saved_locations_own on public.saved_locations;
create policy saved_locations_own on public.saved_locations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Atomic limited insert (Rule 5): the per-user advisory lock serializes
-- concurrent adds, so parallel calls can never exceed the limit.
-- p_limit < 0 means unlimited (enforcement off / fail-open).
create or replace function public.add_saved_location(
  p_user uuid, p_label text, p_address text,
  p_lat float8, p_lon float8, p_neighborhood text, p_limit int
) returns table(ok boolean, loc_id uuid, total int)
language plpgsql security definer set search_path = public as $$
declare n int; new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('saved_loc:' || p_user::text));
  select count(*)::int into n from saved_locations where user_id = p_user;
  if p_limit >= 0 and n >= p_limit then
    return query select false, null::uuid, n;
    return;
  end if;
  insert into saved_locations (user_id, label, address, lat, lon, neighborhood)
  values (p_user, p_label, p_address, p_lat, p_lon, p_neighborhood)
  returning id into new_id;
  return query select true, new_id, n + 1;
end;
$$;

-- ── plan resolution in SQL (mirrors lib/entitlements effectivePlan) ─
create or replace function public.effective_plan_of(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when s.status in ('active','grace') then s.plan_id
      when s.status = 'past_due' and s.grace_until is not null and s.grace_until > now() then s.plan_id
      else 'free'
    end
    from tier_subscriptions s where s.user_id = p_user
  ), 'free');
$$;

-- ── profiles clamp trigger (trusted_circle + channels) ──────────────
create or replace function public.enforce_profile_tier_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  enforced boolean;
  plan text;
  circle_limit int;
  allowed jsonb;
begin
  select enabled into enforced from enforcement_flags where market = 'default';
  if enforced is distinct from true then return NEW; end if;

  plan := effective_plan_of(NEW.id);

  -- trusted circle: trim to the plan's size (keep the first N contacts)
  select (value #>> '{}')::int into circle_limit
    from tier_limits where plan_id = plan and capability = 'trusted_circle';
  if circle_limit is not null
     and jsonb_typeof(coalesce(NEW.contacts, '[]'::jsonb)) = 'array'
     and jsonb_array_length(coalesce(NEW.contacts, '[]'::jsonb)) > circle_limit then
    select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into NEW.contacts
      from jsonb_array_elements(NEW.contacts) with ordinality as t(e, ord)
      where ord <= circle_limit;
  end if;

  -- channels: force any channel not in the plan's allowed list to false
  select value into allowed
    from tier_limits where plan_id = plan and capability = 'channels';
  if allowed is not null and jsonb_typeof(coalesce(NEW.alert_channels, '{}'::jsonb)) = 'object' then
    select coalesce(jsonb_object_agg(k, case when allowed ? k then v else 'false'::jsonb end), '{}'::jsonb)
      into NEW.alert_channels
      from jsonb_each(NEW.alert_channels) as t(k, v);
  end if;

  return NEW;
end;
$$;

drop trigger if exists profiles_tier_limits on public.profiles;
create trigger profiles_tier_limits
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_tier_limits();
