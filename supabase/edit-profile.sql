-- ══════════════════════════════════════════════════════════════════
-- Edit profile support:
--   • profiles.bio — TikTok-style bio on the profile page
--   • update_display_name(new_name) — display-name changes cascade to
--     EVERY past post and comment (author is denormalized text there),
--     done server-side so it's atomic and works despite comments having
--     no user UPDATE policy.
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

alter table public.profiles add column if not exists bio text default '';

create or replace function public.update_display_name(new_name text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if length(trim(new_name)) < 1 or length(new_name) > 60 then
    raise exception 'Name must be 1-60 characters.';
  end if;
  update public.profiles set name = trim(new_name) where id = uid;
  update public.posts set author = trim(new_name) where user_id = uid;
  update public.comments set author = trim(new_name) where user_id = uid;
end $$;
