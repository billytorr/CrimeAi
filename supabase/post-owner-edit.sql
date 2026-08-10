-- Let a user edit and delete their OWN posts.
--
-- Until now the only UPDATE/DELETE policies on public.posts were for
-- admins/moderators (see admin.sql / admin-team.sql). A normal author had no
-- way to modify their own post, so the app's Edit/Delete actions silently
-- affected 0 rows under RLS (no error, but nothing changed — the post came
-- back on refresh). These two policies grant owners update+delete on rows they
-- authored, matched by user_id. Idempotent; safe to re-run.

alter table public.posts enable row level security;

drop policy if exists posts_owner_update on public.posts;
create policy posts_owner_update on public.posts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists posts_owner_delete on public.posts;
create policy posts_owner_delete on public.posts
  for delete
  using (auth.uid() = user_id);
