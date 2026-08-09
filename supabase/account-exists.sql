-- ═══════════════════════════════════════════════════════════════════
-- account_exists(email) — powers the "you already have an account" redirect
--
-- An existing user who lands on the Create Account tab used to be pushed
-- through the email-OTP signup flow (code → choose username → choose
-- password) instead of being asked for the password they already have.
-- The signup screen calls this first and flips to the login form.
--
-- ⚠️ Deliberate enumeration trade-off: this endpoint reveals whether an
-- email has an account. That is the same trade Instagram, TikTok and most
-- consumer apps make, because silently OTP-ing an existing user into a
-- "create your password" flow is worse — it looks like their account was
-- reset. Decided by Billy 2026-08-07. If abuse appears, rate-limit at the
-- edge rather than removing the check.
--
-- ONLY counts accounts that finished signup (a password is set). An
-- OTP-created user who abandoned mid-signup has no password — for them the
-- signup flow IS the right path (it resumes where they left off), and
-- sending them to a password form would strand them.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.account_exists(p_email text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(trim(p_email))
      and coalesce(encrypted_password, '') <> ''
      and deleted_at is null
  );
$$;

revoke all on function public.account_exists(text) from public;
grant execute on function public.account_exists(text) to anon, authenticated;
