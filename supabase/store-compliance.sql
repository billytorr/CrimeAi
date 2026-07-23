-- ══════════════════════════════════════════════════════════════════
-- App Store / Play Store compliance
--   • delete_my_account() — in-app account deletion (Apple 5.1.1(v)):
--     removing the auth user cascades through profiles/posts/likes/
--     follows/comments/messages/events/etc via ON DELETE CASCADE.
--   • content_reports — users flag offensive posts (Apple 1.2 UGC)
--   • blocks — users block abusive accounts (Apple 1.2 UGC)
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if exists (select 1 from public.admins where id = uid and role = 'owner') then
    raise exception 'The owner account cannot be deleted from the app.';
  end if;
  delete from auth.users where id = uid;  -- FK cascades wipe all app data
end $$;

create table if not exists public.content_reports (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid references public.posts on delete cascade,
  reporter_id uuid references auth.users on delete set null,
  reason      text default 'inappropriate',   -- inappropriate|false_report|harassment|violence|spam|other
  detail      text default '',
  status      text default 'open',            -- open|reviewed|actioned
  created_at  timestamptz default now()
);
alter table public.content_reports enable row level security;
drop policy if exists creports_insert on public.content_reports;
create policy creports_insert on public.content_reports for insert
  with check (auth.uid() = reporter_id);
drop policy if exists creports_admin on public.content_reports;
create policy creports_admin on public.content_reports for select using (public.is_admin());
drop policy if exists creports_admin_up on public.content_reports;
create policy creports_admin_up on public.content_reports for update
  using (public.has_role(array['owner','admin','moderator']));

create table if not exists public.blocks (
  blocker_id     uuid references auth.users on delete cascade,
  blocked_handle text not null,
  created_at     timestamptz default now(),
  primary key (blocker_id, blocked_handle)
);
alter table public.blocks enable row level security;
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks for all
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
drop policy if exists blocks_admin_read on public.blocks;
create policy blocks_admin_read on public.blocks for select using (public.is_admin());
