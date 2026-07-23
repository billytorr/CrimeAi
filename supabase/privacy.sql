-- ══════════════════════════════════════════════════════════════════
-- Private accounts (Instagram model)
--   • profiles.is_private — user-controlled toggle
--   • follows.status: 'approved' | 'requested' — following a private
--     account creates a REQUEST the owner must approve
--   • posts of private accounts are hidden AT THE DATABASE from anyone
--     who isn't the owner, an approved follower, or an admin
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

alter table public.profiles add column if not exists is_private boolean default false;
alter table public.follows add column if not exists status text not null default 'approved';

-- the account owner manages requests aimed at them (approve = update,
-- decline / remove follower = delete)
drop policy if exists follows_target_update on public.follows;
create policy follows_target_update on public.follows for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.handle = follows.target_handle));
drop policy if exists follows_target_del on public.follows;
create policy follows_target_del on public.follows for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.handle = follows.target_handle));

-- posts of private accounts: owner, approved followers, admins only
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (
  user_id is null                                   -- seeded/news content
  or user_id = auth.uid()                           -- your own posts
  or public.is_admin()                              -- moderation
  or not exists (                                   -- author is public
    select 1 from public.profiles pr where pr.id = posts.user_id and pr.is_private
  )
  or exists (                                       -- you're an approved follower
    select 1 from public.follows f
    join public.profiles pr on pr.id = posts.user_id
    where f.target_handle = pr.handle and f.follower_id = auth.uid() and f.status = 'approved'
  )
);

-- following a PRIVATE account can only ever be inserted as a request —
-- 'approved' at insert time is only valid for public accounts
drop policy if exists follows_write on public.follows;
create policy follows_write on public.follows for insert
  with check (
    auth.uid() = follower_id
    and (
      status = 'requested'
      or not exists (select 1 from public.profiles p where p.handle = follows.target_handle and p.is_private)
    )
  );
