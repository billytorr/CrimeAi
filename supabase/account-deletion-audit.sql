-- Account-deletion audit log (App Store remediation Phase 2).
--
-- One row per completed in-app account deletion, written by the service role
-- from /api/me/delete. The user identifier is stored ONLY as a SHA-256 hash —
-- enough to answer "was this account deleted, and when" for disputes or
-- chargebacks without retaining the identity we just promised to erase.
-- No user-facing access: RLS is enabled with no policies, so only the
-- service role can read or write. Idempotent; safe to re-run.

create table if not exists public.account_deletions (
  id                       uuid primary key default gen_random_uuid(),
  user_hash                text not null,          -- sha256(user_id), hex
  had_active_subscription  boolean not null default false,
  arb_cancelled            boolean not null default false,
  created_at               timestamptz not null default now()
);

alter table public.account_deletions enable row level security;
-- no policies on purpose: service-role only
