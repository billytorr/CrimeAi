-- ═══════════════════════════════════════════════════════════════════
-- In-app activity feed (Inbox → Activity)
--
-- Separate from push_deliveries, which records what was SENT TO A DEVICE.
-- That is a delivery log, not an activity feed: it has no read state, it is
-- keyed by token rather than by person, and a user with notifications muted
-- has no rows at all — yet they should still see their activity in the app.
-- Instagram and TikTok both keep a durable per-user row; this is that.
--
-- Written by TRIGGERS, like push, so a notification cannot be forgotten by a
-- code path that skipped calling something. The same events feed both.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,  -- recipient
  actor_id    uuid references auth.users on delete set null,          -- who caused it (null = system)
  kind        text not null,          -- like | comment | follow | corroboration | tier | report_nearby | system
  post_id     uuid references public.posts on delete cascade,

  -- Rendered text is denormalised at write time so the feed needs no joins
  -- and reads the same shape the Activity tab already expects. A later rename
  -- leaves old rows showing the old name — the trade Instagram makes too.
  title       text not null,
  body        text,
  tone        text not null default 'social',   -- social | alert | system
  cat         text,                              -- crime category, for the icon

  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

-- One notification per actor per event. Someone unliking and re-liking a post
-- should not stack up rows.
create unique index if not exists notifications_dedupe_idx
  on public.notifications (user_id, actor_id, kind, post_id)
  where actor_id is not null and post_id is not null;

alter table public.notifications enable row level security;

drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications
  for select using (auth.uid() = user_id);

-- Marking read is the only thing a client may write, and only on its own rows.
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── helper: insert, never self-notify, never duplicate ──────────────
create or replace function public.notify(
  p_user uuid, p_actor uuid, p_kind text, p_post uuid,
  p_title text, p_body text, p_tone text default 'social', p_cat text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  -- Nobody wants a notification that they themselves did something.
  if p_user is null or p_user = p_actor then return; end if;

  insert into public.notifications (user_id, actor_id, kind, post_id, title, body, tone, cat)
  values (p_user, p_actor, p_kind, p_post, p_title, p_body, p_tone, p_cat)
  on conflict do nothing;   -- the dedupe index
end;
$$;

-- Display name for the actor, falling back so a notification is never
-- addressed from "null".
create or replace function public.actor_label(p_actor uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(name, ''), '@' || nullif(handle, ''), 'Someone')
  from public.profiles where id = p_actor;
$$;

-- ── likes ───────────────────────────────────────────────────────────
create or replace function public.notify_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; preview text;
begin
  select user_id, left(coalesce(text, ''), 60) into owner, preview
  from public.posts where id = new.post_id;
  perform public.notify(owner, new.user_id, 'like', new.post_id,
    public.actor_label(new.user_id) || ' liked your post',
    nullif(preview, ''), 'social', null);
  return null;
end;
$$;
drop trigger if exists notify_like_trg on public.likes;
create trigger notify_like_trg after insert on public.likes
  for each row execute function public.notify_like();

-- ── comments ────────────────────────────────────────────────────────
create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.posts where id = new.post_id;
  perform public.notify(owner, new.user_id, 'comment', new.post_id,
    public.actor_label(new.user_id) || ' commented on your post',
    left(coalesce(new.text, ''), 80), 'social', null);
  return null;
end;
$$;
drop trigger if exists notify_comment_trg on public.comments;
create trigger notify_comment_trg after insert on public.comments
  for each row execute function public.notify_comment();

-- ── follows ─────────────────────────────────────────────────────────
-- A follow REQUEST is not notified here: the Activity tab already renders
-- pending requests at the top with Approve/Decline, so a second row for the
-- same thing would just be noise.
create or replace function public.notify_follow() returns trigger
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if new.status is distinct from 'approved' then return null; end if;
  select id into target from public.profiles where handle = new.target_handle;
  perform public.notify(target, new.follower_id, 'follow', null,
    public.actor_label(new.follower_id) || ' followed you', null, 'social', null);
  return null;
end;
$$;
drop trigger if exists notify_follow_trg on public.follows;
create trigger notify_follow_trg after insert or update on public.follows
  for each row execute function public.notify_follow();

-- ── corroborations ──────────────────────────────────────────────────
-- Someone confirming your report is the single most motivating signal in the
-- app — it says a neighbour saw the same thing.
do $$ begin
  if to_regclass('public.corroborations') is not null then
    execute $f$
      create or replace function public.notify_corroboration() returns trigger
      language plpgsql security definer set search_path = public as $b$
      declare owner uuid;
      begin
        select user_id into owner from public.posts where id = new.report_id;
        perform public.notify(owner, new.user_id, 'corroboration', new.report_id,
          public.actor_label(new.user_id) || ' confirmed your report',
          'Another neighbor saw the same thing', 'alert', null);
        return null;
      end;
      $b$;
    $f$;
    execute 'drop trigger if exists notify_corroboration_trg on public.corroborations';
    execute 'create trigger notify_corroboration_trg after insert on public.corroborations
             for each row execute function public.notify_corroboration()';
  end if;
end $$;

-- ── Guardian tier promotion ─────────────────────────────────────────
do $$ begin
  if to_regclass('public.guardian_scores') is not null then
    execute $f$
      create or replace function public.notify_tier() returns trigger
      language plpgsql security definer set search_path = public as $b$
      begin
        if new.tier is distinct from old.tier and new.tier is not null then
          insert into public.notifications (user_id, actor_id, kind, title, body, tone)
          values (new.user_id, null, 'tier',
                  'You reached ' || initcap(new.tier),
                  'Your Guardian rank went up — thanks for keeping the block watched.',
                  'system');
        end if;
        return null;
      end;
      $b$;
    $f$;
    execute 'drop trigger if exists notify_tier_trg on public.guardian_scores';
    execute 'create trigger notify_tier_trg after update on public.guardian_scores
             for each row execute function public.notify_tier()';
  end if;
end $$;

-- ── read state ──────────────────────────────────────────────────────
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with done as (
    update public.notifications set read_at = now()
     where user_id = auth.uid() and read_at is null
       and (p_ids is null or id = any(p_ids))
    returning 1
  ) select count(*) into n from done;
  return coalesce(n, 0);
end;
$$;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create or replace function public.unread_notification_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.notifications
   where user_id = auth.uid() and read_at is null;
$$;
grant execute on function public.unread_notification_count() to authenticated;
