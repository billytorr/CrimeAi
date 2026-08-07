-- ═══════════════════════════════════════════════════════════════════
-- Official accounts (@crimeai) + suggested follows
--
-- @crimeai is a real account, not a special case in the code: it posts,
-- is followed, and appears in feeds exactly like any other profile. The
-- only difference is `is_official`, which earns it a badge and first place
-- in the follow suggestions.
--
-- ⚠️ NO PASSWORD LIVES HERE. The auth user is created by Billy in the
-- Supabase dashboard with a password only he knows; `designate_official`
-- then attaches the profile to it by email. A credential in a migration is
-- a credential in git forever.
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists is_official boolean default false;

-- Only one account may hold a given official handle.
create unique index if not exists profiles_official_handle_idx
  on public.profiles (handle) where is_official;

-- ── distance helper ────────────────────────────────────────────────
-- Haversine in miles. Immutable so it can be used in indexes/filters, and
-- clamped before acos() because floating point can push the argument a
-- hair outside [-1,1] for identical points and raise a domain error.
create or replace function public.miles_between(
  a_lat double precision, a_lon double precision,
  b_lat double precision, b_lon double precision
) returns double precision
language sql immutable parallel safe as $$
  select 3959 * acos(least(1, greatest(-1,
      cos(radians(a_lat)) * cos(radians(b_lat)) * cos(radians(b_lon) - radians(a_lon))
    + sin(radians(a_lat)) * sin(radians(b_lat))
  )));
$$;

-- ── suggested follows ──────────────────────────────────────────────
-- Official accounts first, then PUBLIC profiles inside the radius the user
-- chose during onboarding, nearest first.
--
-- Privacy rules this must never break:
--   • private profiles are never suggested — being suggested is a form of
--     exposure, and a private account has asked not to be discoverable
--   • nobody the user already follows or has requested is suggested
--   • no coordinates are returned, only a rounded distance — a suggestion
--     list must not become a way to triangulate where someone lives
create or replace function public.suggested_follows(p_user uuid, p_limit int default 20)
returns table (
  handle          text,
  name            text,
  photo_url       text,
  neighborhood    text,
  distance_miles  double precision,
  is_official     boolean
)
language sql stable security definer set search_path = public as $$
  with me as (
    select lat, lon, coalesce(radius_miles, 1) as radius_miles
    from public.profiles where id = p_user
  )
  select
    p.handle,
    p.name,
    p.photo_url,
    p.neighborhood,
    case
      when coalesce(p.is_official, false) then 0::double precision
      when p.lat is null or m.lat is null then null
      -- one decimal place: enough to be useful, too coarse to locate anyone
      else round(public.miles_between(m.lat, m.lon, p.lat, p.lon)::numeric, 1)::double precision
    end as distance_miles,
    coalesce(p.is_official, false) as is_official
  from public.profiles p
  cross join me m
  where p.id <> p_user
    and p.handle is not null
    and coalesce(p.is_private, false) = false          -- never suggest a private account
    and coalesce(p.onboarded, false)                    -- no half-finished profiles
    and not exists (
      select 1 from public.follows f
      where f.follower_id = p_user and f.target_handle = p.handle
    )
    and (
      coalesce(p.is_official, false)                    -- official ignores distance
      or (
        p.lat is not null and m.lat is not null
        and public.miles_between(m.lat, m.lon, p.lat, p.lon) <= m.radius_miles
      )
    )
  order by
    coalesce(p.is_official, false) desc,                -- @crimeai always first
    distance_miles asc nulls last,
    p.created_at desc
  limit greatest(1, least(p_limit, 50));
$$;

revoke all on function public.suggested_follows(uuid, int) from public;
grant execute on function public.suggested_follows(uuid, int) to authenticated, service_role;

-- ── one-time setup, run by Billy ───────────────────────────────────
-- Attaches the official profile to an auth user that ALREADY EXISTS.
-- Create the user first: Supabase Dashboard → Authentication → Users →
-- Add user, with an email you control and a password you choose.
create or replace function public.designate_official(p_email text, p_handle text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'No auth user with email %. Create it in the Supabase dashboard first.', p_email;
  end if;

  insert into public.profiles (id, name, email, handle, is_official, onboarded, is_private)
  values (v_id, 'CrimeAI', p_email, p_handle, true, true, false)
  on conflict (id) do update
    set handle = excluded.handle,
        name = coalesce(nullif(public.profiles.name, ''), excluded.name),
        is_official = true,
        onboarded = true,
        is_private = false;   -- an official account is never private

  return v_id;
end;
$$;

revoke all on function public.designate_official(text, text) from public;
-- service_role only: this mints an official identity.
grant execute on function public.designate_official(text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════
-- RUN THIS ONCE, after creating the auth user in the dashboard:
--
--   select public.designate_official('crimeai@publicsafetycrimecenter.com', 'crimeai');
--
-- Then verify:
--   select handle, name, is_official from public.profiles where is_official;
-- ═══════════════════════════════════════════════════════════════════
