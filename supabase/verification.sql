-- ═══════════════════════════════════════════════════════════════════
-- ID verification: BIPA consent, submission queue, admin review
--
-- Builds on identity_status (supabase/identity.sql), which already models
-- levels 0-4 where L3/L4 mean "a vendor matched a face to a government ID".
-- That is exactly the condition behind the verified check on a profile.
--
-- POLICY (see DATA-GOVERNANCE.md):
--   • posting is open to everyone — identity gates REPORTING only
--   • no document, image or face template is ever stored in this database.
--     Files live in a private storage bucket for at most 24 hours; this
--     table holds decisions and references, never content.
--   • consent is captured BEFORE any capture and is proven from
--     biometric_consents, which outlives the account.
-- ═══════════════════════════════════════════════════════════════════

-- ── BIPA consent ───────────────────────────────────────────────────
-- The evidence that a specific person agreed to specific words at a
-- specific time. Illinois requires a written release before collection;
-- "they accepted the ToS" is not one. Rows are append-only: a consent
-- record that can be edited proves nothing.
create table if not exists public.biometric_consents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  policy_version int not null,
  consent_text  text not null,          -- the exact words shown, verbatim
  granted       boolean not null,       -- false = explicitly declined
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists biometric_consents_user_idx on public.biometric_consents (user_id, created_at desc);

create or replace function public.biometric_consents_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'biometric_consents is append-only — consent records cannot be altered or deleted';
end;
$$;
drop trigger if exists biometric_consents_no_change on public.biometric_consents;
create trigger biometric_consents_no_change
  before update or delete on public.biometric_consents
  for each row execute function public.biometric_consents_immutable();

alter table public.biometric_consents enable row level security;
drop policy if exists biometric_consents_own_read on public.biometric_consents;
create policy biometric_consents_own_read on public.biometric_consents
  for select using (auth.uid() = user_id);

-- ── verification submissions ───────────────────────────────────────
-- One row per attempt. Reviewed in the Command Center, or auto-decided by
-- the IDV vendor once one is configured.
do $$ begin
  create type public.verification_status as enum ('pending','approved','rejected','expired','revoked');
exception when duplicate_object then null; end $$;

create table if not exists public.identity_verifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  status        public.verification_status not null default 'pending',
  method        text not null default 'vendor',      -- vendor | manual
  consent_id    uuid references public.biometric_consents,

  -- References only. NEVER the document, the image, or a face template.
  vendor        text,
  vendor_ref    text,
  vendor_passed boolean,
  face_match    boolean,                             -- selfie matched the ID photo
  doc_valid     boolean,                             -- the ID itself checked out
  over_18       boolean,
  id_last4      text,                                -- last 4 only
  id_state      text,

  -- Temporary storage paths, purged by purge_expired_verification_media().
  selfie_path   text,
  doc_path      text,
  media_expires_at timestamptz,

  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid references auth.users,
  reviewed_at   timestamptz,
  reason        text,                                -- shown to the user on rejection
  created_at    timestamptz not null default now()
);
create index if not exists identity_verifications_queue_idx
  on public.identity_verifications (status, submitted_at) where status = 'pending';
create index if not exists identity_verifications_user_idx
  on public.identity_verifications (user_id, created_at desc);

-- A user may only ever have one verification in flight.
create unique index if not exists identity_verifications_one_pending
  on public.identity_verifications (user_id) where status = 'pending';

alter table public.identity_verifications enable row level security;
drop policy if exists identity_verifications_own_read on public.identity_verifications;
create policy identity_verifications_own_read on public.identity_verifications
  for select using (auth.uid() = user_id);

-- ── the 24-hour destruction promise, enforced ──────────────────────
-- The privacy policy states images are destroyed within 24 hours. A
-- schedule you cannot prove you followed is worse than not having one, so
-- this clears the paths and records that it ran.
create table if not exists public.verification_media_purges (
  id          uuid primary key default gen_random_uuid(),
  purged      int not null,
  ran_at      timestamptz not null default now()
);

-- RLS on, and DELIBERATELY NO POLICY. This is the evidence that the 24-hour
-- destruction schedule actually ran, so no app client should read or write
-- it — only the service role, which bypasses RLS, and which is what runs the
-- purge. With RLS enabled and no policy, anon and authenticated get nothing.
alter table public.verification_media_purges enable row level security;

create or replace function public.purge_expired_verification_media()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with cleared as (
    update public.identity_verifications
       set selfie_path = null, doc_path = null, media_expires_at = null
     where media_expires_at is not null and media_expires_at < now()
       and (selfie_path is not null or doc_path is not null)
    returning 1
  ) select count(*) into n from cleared;

  insert into public.verification_media_purges (purged) values (coalesce(n, 0));
  return coalesce(n, 0);
end;
$$;
revoke all on function public.purge_expired_verification_media() from public;
grant execute on function public.purge_expired_verification_media() to service_role;

-- ── decision → identity_status ─────────────────────────────────────
-- Approving a verification is what lights up the verified check. Level 3
-- means "vendor matched a face to a government ID"; the badge reads L3+.
create or replace function public.decide_verification(
  p_id uuid, p_approve boolean, p_reviewer uuid, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select * into v from public.identity_verifications where id = p_id for update;
  if v is null then raise exception 'no such verification %', p_id; end if;
  if v.status <> 'pending' then raise exception 'verification % is already %', p_id, v.status; end if;

  update public.identity_verifications
     set status = case when p_approve then 'approved' else 'rejected' end::public.verification_status,
         reviewed_by = p_reviewer, reviewed_at = now(), reason = p_reason,
         -- a decision ends the need for the images, whatever the clock says
         selfie_path = null, doc_path = null, media_expires_at = null
   where id = p_id;

  if p_approve then
    insert into public.identity_status (user_id, level, vendor_ref, vendor_passed, vendor_level, over_18, verified_at, expires_at, updated_at)
    values (v.user_id, 3, v.vendor_ref, true, 3, v.over_18, now(), now() + interval '1 year', now())
    on conflict (user_id) do update
      set level = greatest(public.identity_status.level, 3),
          vendor_ref = excluded.vendor_ref, vendor_passed = true, vendor_level = 3,
          over_18 = coalesce(excluded.over_18, public.identity_status.over_18),
          verified_at = now(), expires_at = now() + interval '1 year', updated_at = now();
  end if;
end;
$$;
revoke all on function public.decide_verification(uuid, boolean, uuid, text) from public;
grant execute on function public.decide_verification(uuid, boolean, uuid, text) to service_role;

-- Revoking, for a verification later found fraudulent.
create or replace function public.revoke_verification(p_user uuid, p_reviewer uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.identity_status
     set level = least(level, 2), vendor_passed = false, vendor_level = null,
         verified_at = null, expires_at = null, updated_at = now()
   where user_id = p_user;

  insert into public.identity_verifications (user_id, status, method, reviewed_by, reviewed_at, reason)
  values (p_user, 'revoked', 'manual', p_reviewer, now(), p_reason);
end;
$$;
revoke all on function public.revoke_verification(uuid, uuid, text) from public;
grant execute on function public.revoke_verification(uuid, uuid, text) to service_role;

-- ── the badge ──────────────────────────────────────────────────────
-- Verified = vendor-passed AND not expired. Read by the profile badge and
-- by the report gate, so both answer from one definition.
create or replace function public.is_identity_verified(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select level >= 3 and coalesce(vendor_passed, false)
            and (expires_at is null or expires_at > now())
       from public.identity_status where user_id = p_user),
    false);
$$;
grant execute on function public.is_identity_verified(uuid) to authenticated, service_role;
