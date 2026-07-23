-- ══════════════════════════════════════════════════════════════════
-- Live Media Brand Ambassador program.
-- LIVE streaming is invite-only: users apply with qualifying info,
-- the Command Center reviews, and approval flips profiles.live_enabled.
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

alter table public.profiles add column if not exists live_enabled boolean default false;

create table if not exists public.live_applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users on delete cascade,
  name        text default '',
  email       text default '',
  handle      text default '',
  phone       text default '',
  reason      text default '',      -- why they want to be an ambassador
  experience  text default '',      -- media / reporting / community experience
  socials     text default '',      -- links that show their work
  status      text default 'pending',  -- pending | approved | declined
  decided_by  text,
  decided_at  timestamptz,
  created_at  timestamptz default now()
);

alter table public.live_applications enable row level security;
drop policy if exists live_apps_insert on public.live_applications;
create policy live_apps_insert on public.live_applications for insert
  with check (auth.uid() = user_id);
drop policy if exists live_apps_own_update on public.live_applications;
create policy live_apps_own_update on public.live_applications for update
  using (auth.uid() = user_id and status <> 'approved')
  with check (auth.uid() = user_id and status = 'pending');  -- reapply after decline, never self-approve
drop policy if exists live_apps_read on public.live_applications;
create policy live_apps_read on public.live_applications for select
  using (auth.uid() = user_id or public.is_admin());
drop policy if exists live_apps_admin on public.live_applications;
create policy live_apps_admin on public.live_applications for update
  using (public.has_role(array['owner','admin','moderator']));
