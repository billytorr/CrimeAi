-- ══════════════════════════════════════════════════════════════════
-- Command Center — team management (run after admin.sql; idempotent)
--
-- Role model mirrors Facebook Page roles, adapted to PSCC:
--   owner     — full control, manages everyone incl. admins (Billy)
--   admin     — full control, manages moderators/analysts
--   moderator — users, content, feedback, issues (front-line safety team)
--   analyst   — read-only insights (overview + analytics)
-- ══════════════════════════════════════════════════════════════════

set search_path = public, extensions;

alter table public.admins add column if not exists name text default '';
alter table public.admins add column if not exists invited_by text default '';

update public.admins set name = 'Billy Torres'   where email = 'billy@blackseed.io' and (name = '' or name is null);
update public.admins set name = 'Pedro Palomino' where email = 'pedro.palomino@psccmail.org' and (name = '' or name is null);
update public.admins set name = 'Josh Domino'    where email = 'josh.domino@psccmail.org' and (name = '' or name is null);

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where id = auth.uid() and role = 'owner') $$;

-- Team management policies:
--  • any admin/owner can invite (insert) moderators & analysts
--  • only the owner can grant/change the 'admin' role or touch admins
--  • nobody can delete/demote an owner through the portal
drop policy if exists admins_insert on public.admins;
create policy admins_insert on public.admins for insert
  with check (
    public.is_admin()
    and role <> 'owner'
    and (role <> 'admin' or public.is_owner())
  );

drop policy if exists admins_update on public.admins;
create policy admins_update on public.admins for update
  using (public.is_admin() and role <> 'owner' and (role <> 'admin' or public.is_owner()))
  with check (role <> 'owner' and (role <> 'admin' or public.is_owner()));

drop policy if exists admins_delete on public.admins;
create policy admins_delete on public.admins for delete
  using (public.is_admin() and role <> 'owner' and (role <> 'admin' or public.is_owner()));

-- Invited teammates are created by an admin, so their email is treated as
-- verified (the admin typed it). Callable only by portal admins, via RPC.
create or replace function public.admin_confirm_invited(target_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now())
  where email = lower(target_email)
    and id in (select id from public.admins);
end $$;

-- ── role-aware enforcement (defense in depth) ───────────────────────
-- The portal hides sections by role, but the database must agree:
create or replace function public.has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where id = auth.uid() and role = any(roles)) $$;

-- publishing updates: owner/admin only
drop policy if exists ann_admin_write on public.announcements;
create policy ann_admin_write on public.announcements for insert with check (public.has_role(array['owner','admin']));
drop policy if exists ann_admin_update on public.announcements;
create policy ann_admin_update on public.announcements for update using (public.has_role(array['owner','admin']));
drop policy if exists ann_admin_del on public.announcements;
create policy ann_admin_del on public.announcements for delete using (public.has_role(array['owner','admin']));

-- moderation powers: owner/admin/moderator (analysts are read-only)
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update using (public.has_role(array['owner','admin','moderator']));
drop policy if exists posts_admin_delete on public.posts;
create policy posts_admin_delete on public.posts for delete using (public.has_role(array['owner','admin','moderator']));
drop policy if exists posts_admin_update on public.posts;
create policy posts_admin_update on public.posts for update using (public.has_role(array['owner','admin','moderator']));
drop policy if exists comments_admin_delete on public.comments;
create policy comments_admin_delete on public.comments for delete using (public.has_role(array['owner','admin','moderator']));
drop policy if exists feedback_admin_update on public.feedback;
create policy feedback_admin_update on public.feedback for update using (public.has_role(array['owner','admin','moderator']));
drop policy if exists issues_admin on public.issues;
create policy issues_admin on public.issues for all using (public.has_role(array['owner','admin','moderator'])) with check (public.has_role(array['owner','admin','moderator']));

-- audit log: every staff member writes, only owner/admin read
drop policy if exists audit_admin on public.audit_log;
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert with check (public.is_admin());
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select using (public.has_role(array['owner','admin']));
