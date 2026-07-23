-- ─────────────────────────────────────────────────────────────
-- CrimeAI / PSCC — Supabase schema
-- Run this once in your Supabase project: SQL Editor → paste → Run.
-- Then run seed.sql for the demo community content.
-- ─────────────────────────────────────────────────────────────

-- PROFILES (1:1 with auth.users) ------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  name          text not null default 'Neighbor',
  email         text,
  handle        text unique,                 -- public @handle; used for real follower/following counts
  phone         text default '',
  photo_url     text default '',
  address       text default '',
  neighborhood  text default '',
  lat           double precision,
  lon           double precision,
  used_geolocation boolean default false,
  radius_miles  double precision default 1,
  alert_categories text[] default '{}',
  alert_channels   jsonb default '{"push":true,"sms":false,"email":true}',
  severity_min  int default 2,
  contacts      jsonb default '[]',
  onboarded     boolean default false,
  created_at    timestamptz default now()
);

-- POSTS -------------------------------------------------------------------------
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users on delete cascade,  -- null for seed/news/system
  kind          text not null,                                  -- report|observation|news|reel|thread|image
  author        text not null,
  handle        text not null,
  color         text default '#1b7f3a',
  verified      boolean default false,
  neighborhood  text,
  lat           double precision,
  lon           double precision,
  text          text default '',
  category      text,
  media_url     text,
  media_type    text,                                            -- image|video
  scene         text,
  duration_sec  int,
  thread        text[],
  tags          text[],
  source        text,
  likes         int default 0,                                   -- maintained by trigger
  comments      int default 0,                                   -- maintained by trigger
  shares        int default 0,
  is_live       boolean default false,                           -- live streams
  viewers       int,
  created_at    timestamptz default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_user_idx on public.posts (user_id);

-- LIKES / SAVES / FOLLOWS / COMMENTS --------------------------------------------
create table if not exists public.likes (
  user_id uuid references auth.users on delete cascade,
  post_id uuid references public.posts on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);
create table if not exists public.saves (
  user_id uuid references auth.users on delete cascade,
  post_id uuid references public.posts on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);
create table if not exists public.follows (
  follower_id   uuid references auth.users on delete cascade,
  target_handle text not null,
  created_at    timestamptz default now(),
  primary key (follower_id, target_handle)
);
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.posts on delete cascade,
  user_id    uuid references auth.users on delete cascade,
  author     text not null,
  text       text not null,
  created_at timestamptz default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

-- COUNTER TRIGGERS --------------------------------------------------------------
create or replace function public.bump_post_counter() returns trigger as $$
declare col text; delta int; pid uuid;
begin
  col := tg_argv[0];
  if (tg_op = 'INSERT') then delta := 1; pid := new.post_id;
  else delta := -1; pid := old.post_id; end if;
  execute format('update public.posts set %I = greatest(0, %I + $1) where id = $2', col, col)
    using delta, pid;
  if (tg_op = 'INSERT') then return new; else return old; end if;
end; $$ language plpgsql security definer;

drop trigger if exists likes_count on public.likes;
create trigger likes_count after insert or delete on public.likes
  for each row execute function public.bump_post_counter('likes');

drop trigger if exists comments_count on public.comments;
create trigger comments_count after insert or delete on public.comments
  for each row execute function public.bump_post_counter('comments');

-- AUTO-CREATE PROFILE ON SIGNUP -------------------------------------------------
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Neighbor'), new.email)
  on conflict (id) do nothing;
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ROW LEVEL SECURITY ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.likes    enable row level security;
alter table public.saves    enable row level security;
alter table public.follows  enable row level security;
alter table public.comments enable row level security;

-- profiles: anyone can read; you manage your own
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_upsert on public.profiles;
create policy profiles_upsert on public.profiles for insert with check (auth.uid() = id);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (auth.uid() = id);

-- posts: anyone can read; you create/edit/delete your own
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (true);
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert with check (auth.uid() = user_id);
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update using (auth.uid() = user_id);
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete using (auth.uid() = user_id);

-- interactions: anyone can read counts/rows; you write your own
do $$
declare t text;
begin
  foreach t in array array['likes','saves'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select using (true)', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for insert with check (auth.uid() = user_id)', t);
    execute format('drop policy if exists %1$s_del on public.%1$s', t);
    execute format('create policy %1$s_del on public.%1$s for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select using (true);
drop policy if exists follows_write on public.follows;
create policy follows_write on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists follows_del on public.follows;
create policy follows_del on public.follows for delete using (auth.uid() = follower_id);

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select using (true);
drop policy if exists comments_write on public.comments;
create policy comments_write on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists comments_del on public.comments;
create policy comments_del on public.comments for delete using (auth.uid() = user_id);

-- STORAGE (media bucket) --------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select using (bucket_id = 'media');
drop policy if exists media_write on storage.objects;
create policy media_write on storage.objects for insert
  to authenticated with check (bucket_id = 'media');

-- DIRECT MESSAGES (neighbor-to-neighbor) ----------------------------------------
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid references auth.users on delete cascade,
  recipient_id  uuid references auth.users on delete cascade,  -- null when messaging a seeded persona handle
  recipient_handle text,
  text          text not null,
  created_at    timestamptz default now()
);
create index if not exists messages_thread_idx on public.messages (sender_id, recipient_id, created_at);
alter table public.messages enable row level security;
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists messages_send on public.messages;
create policy messages_send on public.messages for insert with check (auth.uid() = sender_id);
