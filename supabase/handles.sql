-- ══════════════════════════════════════════════════════════════════
-- @handle (username) support — atomic rename with cascade.
-- Users own their profile row, but renames must also move their posts
-- and their followers' rows — done here server-side, in one call,
-- so RLS stays strict and races hit the unique constraint safely.
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

create or replace function public.rename_handle(new_handle text) returns void
language plpgsql security definer set search_path = public as $$
declare
  old_handle text;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if new_handle !~ '^[a-z0-9._]{3,30}$'
     or new_handle like '.%' or new_handle like '%.'
     or new_handle like '%..%' then
    raise exception 'Invalid username.';
  end if;
  select handle into old_handle from public.profiles where id = uid;
  -- unique index on profiles.handle makes claim races fail loudly here
  update public.profiles set handle = new_handle where id = uid;
  update public.posts set handle = new_handle where user_id = uid;
  if old_handle is not null and old_handle <> new_handle then
    update public.follows set target_handle = new_handle where target_handle = old_handle;
  end if;
end $$;
