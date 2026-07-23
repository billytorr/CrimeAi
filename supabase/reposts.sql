-- ══════════════════════════════════════════════════════════════════
-- Reposts (TikTok/Instagram model): a repost is a REFERENCE to the
-- original post, never a copy — so the original author keeps the
-- attribution, and a reposted REPORT never creates a second map pin
-- (pins come only from the original post's row).
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

alter table public.posts add column if not exists reposts int default 0;

create table if not exists public.reposts (
  user_id    uuid references auth.users on delete cascade,
  post_id    uuid references public.posts on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);

alter table public.reposts enable row level security;
drop policy if exists reposts_read on public.reposts;
create policy reposts_read on public.reposts for select using (true);
drop policy if exists reposts_write on public.reposts;
create policy reposts_write on public.reposts for insert with check (auth.uid() = user_id);
drop policy if exists reposts_del on public.reposts;
create policy reposts_del on public.reposts for delete using (auth.uid() = user_id);

drop trigger if exists reposts_count on public.reposts;
create trigger reposts_count after insert or delete on public.reposts
  for each row execute function public.bump_post_counter('reposts');
