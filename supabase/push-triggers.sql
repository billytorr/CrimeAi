-- Real-time push triggers (ADDITIVE).
--
-- Vercel Hobby crons run once a day, which is useless for "someone commented
-- on your post". pg_net lets Postgres fire an async HTTP call the instant a
-- row lands, so notifications are real-time with no polling and no plan
-- change. The trigger NEVER blocks or fails the originating write.
--
-- Reversal:
--   drop trigger if exists push_on_comment on public.comments;   (etc. below)
--   drop function if exists public.notify_push(text, jsonb);
--   alter table public.profiles drop column if exists push_types;

create extension if not exists pg_net with schema extensions;

-- Per-type notification preferences. Defaults ON except 'like' (the noisiest,
-- least important). `alert_channels.push` remains the master switch.
alter table public.profiles add column if not exists push_types jsonb not null default
  '{"comment": true, "like": false, "report": true, "message": true, "news": true, "follow": true, "corroboration": true}'::jsonb;

-- ── the dispatcher ──────────────────────────────────────────────────
-- Posts the event to our API, which resolves recipients, checks
-- preferences, and sends. Wrapped so a failure can never break the insert.
create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  endpoint text;
  secret   text;
begin
  select value into endpoint from public.app_settings where key = 'push_endpoint';
  select value into secret   from public.app_settings where key = 'push_secret';
  if endpoint is null or secret is null then
    return null;                             -- not configured yet: silently skip
  end if;

  perform extensions.net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    body    := jsonb_build_object('type', TG_ARGV[0], 'record', to_jsonb(NEW)),
    timeout_milliseconds := 4000
  );
  return null;                               -- AFTER trigger; result ignored
exception when others then
  return null;                               -- never break the originating write
end;
$$;

-- Small settings table so the endpoint/secret are configurable without a
-- migration (and never hardcoded in a trigger).
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
-- service role only; no policy (the trigger is security definer)

-- ── triggers ────────────────────────────────────────────────────────
drop trigger if exists push_on_comment on public.comments;
create trigger push_on_comment after insert on public.comments
  for each row execute function public.notify_push('comment');

drop trigger if exists push_on_like on public.likes;
create trigger push_on_like after insert on public.likes
  for each row execute function public.notify_push('like');

drop trigger if exists push_on_message on public.messages;
create trigger push_on_message after insert on public.messages
  for each row execute function public.notify_push('message');

drop trigger if exists push_on_follow on public.follows;
create trigger push_on_follow after insert on public.follows
  for each row execute function public.notify_push('follow');

drop trigger if exists push_on_corroboration on public.corroborations;
create trigger push_on_corroboration after insert on public.corroborations
  for each row execute function public.notify_push('corroboration');

-- posts: reports (nearby alert) and news are different notifications, so the
-- API branches on kind. Fires for every post; the API decides who cares.
drop trigger if exists push_on_post on public.posts;
create trigger push_on_post after insert on public.posts
  for each row execute function public.notify_push('post');

-- announcements: only when actually published
drop trigger if exists push_on_announcement on public.announcements;
create trigger push_on_announcement after insert or update of status on public.announcements
  for each row when (NEW.status = 'published') execute function public.notify_push('announcement');
