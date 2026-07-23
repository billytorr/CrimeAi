-- ══════════════════════════════════════════════════════════════════
-- CrimeAI Command Center — admin infrastructure
-- Run after schema.sql. Safe to re-run (idempotent).
--
--  • admins allowlist + is_admin() helper
--  • ban system (profiles.banned; banned users cannot post or log in)
--  • events        — product analytics (impressions, behavior, engagement)
--  • feedback      — in-app user feedback inbox
--  • issues        — bug / task tracker
--  • announcements — updates pushed to the app's Inbox
--  • audit_log     — every admin action, recorded
--  • admin RLS policies across all app tables (read everything,
--    moderate posts/comments, manage users)
-- ══════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ── admins ──────────────────────────────────────────────────────────
create table if not exists public.admins (
  id         uuid primary key references auth.users on delete cascade,
  email      text unique not null,
  role       text not null default 'admin',        -- admin | owner
  created_at timestamptz default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where id = auth.uid()) $$;

alter table public.admins enable row level security;
drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select using (public.is_admin());

-- ── ban system ──────────────────────────────────────────────────────
alter table public.profiles add column if not exists banned boolean default false;
alter table public.profiles add column if not exists banned_reason text;
alter table public.profiles add column if not exists banned_at timestamptz;

-- banned users cannot create posts (server-side enforcement, not just UI)
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert
  with check (
    auth.uid() = user_id
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.banned)
  );

-- ── events (product analytics) ──────────────────────────────────────
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users on delete set null,
  name       text not null,                        -- app_open|tab_view|post_create|like|comment|follow|dm_send|sos_open|live_start|search|report_create
  props      jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists events_name_time on public.events (name, created_at desc);
create index if not exists events_time on public.events (created_at desc);

alter table public.events enable row level security;
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert
  with check (auth.uid() = user_id);
drop policy if exists events_admin_read on public.events;
create policy events_admin_read on public.events for select using (public.is_admin());

-- ── feedback ────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users on delete set null,
  author     text default '',
  category   text default 'general',               -- general|bug|idea|safety
  message    text not null,
  status     text default 'new',                   -- new|reviewing|closed
  created_at timestamptz default now()
);
alter table public.feedback enable row level security;
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert with check (auth.uid() = user_id);
drop policy if exists feedback_own on public.feedback;
create policy feedback_own on public.feedback for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists feedback_admin_update on public.feedback;
create policy feedback_admin_update on public.feedback for update using (public.is_admin());

-- ── issues (bug tracker) ────────────────────────────────────────────
create table if not exists public.issues (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  description text default '',
  area       text default 'app',                   -- app|backend|map|feed|auth|live|other
  severity   text default 'medium',                -- low|medium|high|critical
  status     text default 'open',                  -- open|in_progress|resolved
  reporter   text default '',
  assignee   text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.issues enable row level security;
drop policy if exists issues_admin on public.issues;
create policy issues_admin on public.issues for all using (public.is_admin()) with check (public.is_admin());

-- ── announcements (app updates) ─────────────────────────────────────
create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  audience     text default 'all',                 -- all|miami|beta
  status       text default 'draft',               -- draft|published
  created_by   text default '',
  created_at   timestamptz default now(),
  published_at timestamptz
);
alter table public.announcements enable row level security;
drop policy if exists ann_public_read on public.announcements;
create policy ann_public_read on public.announcements for select
  using (status = 'published' or public.is_admin());
drop policy if exists ann_admin_write on public.announcements;
create policy ann_admin_write on public.announcements for insert with check (public.is_admin());
drop policy if exists ann_admin_update on public.announcements;
create policy ann_admin_update on public.announcements for update using (public.is_admin());
drop policy if exists ann_admin_del on public.announcements;
create policy ann_admin_del on public.announcements for delete using (public.is_admin());

-- ── audit log ───────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  admin_id   uuid references auth.users on delete set null,
  admin_email text default '',
  action     text not null,                        -- ban_user|unban_user|delete_post|publish_announcement|close_feedback|...
  target     text default '',
  meta       jsonb default '{}',
  created_at timestamptz default now()
);
alter table public.audit_log enable row level security;
drop policy if exists audit_admin on public.audit_log;
create policy audit_admin on public.audit_log for all using (public.is_admin()) with check (public.is_admin());

-- ── admin powers over app tables ────────────────────────────────────
-- read everything
drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles for select using (public.is_admin());
drop policy if exists messages_admin_read on public.messages;
create policy messages_admin_read on public.messages for select using (public.is_admin());
-- manage users (ban/unban)
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update using (public.is_admin());
-- moderate content
drop policy if exists posts_admin_delete on public.posts;
create policy posts_admin_delete on public.posts for delete using (public.is_admin());
drop policy if exists posts_admin_update on public.posts;
create policy posts_admin_update on public.posts for update using (public.is_admin());
drop policy if exists comments_admin_delete on public.comments;
create policy comments_admin_delete on public.comments for delete using (public.is_admin());

-- ── the three Command Center admins ─────────────────────────────────
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('ad000000-0000-4000-8000-000000000001'::uuid, 'billy@blackseed.io',          'Billy Torres',   'TorrCommand2026!', 'owner'),
      ('ad000000-0000-4000-8000-000000000002'::uuid, 'pedro.palomino@psccmail.org', 'Pedro Palomino', 'PedroPSCC2026!',   'admin'),
      ('ad000000-0000-4000-8000-000000000003'::uuid, 'josh.domino@psccmail.org',    'Josh Domino',    'JoshPSCC2026!',    'admin')
    ) as t(id, email, name, pw, role)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, crypt(u.pw, gen_salt('bf')),
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', u.name),
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', u.id::text, now(), now(), now()
    ) on conflict (provider, provider_id) do nothing;

    insert into public.admins (id, email, role) values (u.id, u.email, u.role)
    on conflict (id) do nothing;
  end loop;
end $$;
