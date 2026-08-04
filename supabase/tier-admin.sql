-- Phase 2A: lock down tier-config tables + give Command Center admins
-- read/write access.
--
-- SECURITY FIX: tier_plans / tier_prices / tier_limits / enforcement_flags
-- were created without RLS, which in Supabase means the anon key could WRITE
-- them (change prices, flip the kill switch). Enable RLS everywhere. The app
-- server reads config via the service role (bypasses RLS), so it is
-- unaffected. Command Center admins get access via has_role().

-- ── tier_plans ──────────────────────────────────────────────────────
alter table public.tier_plans enable row level security;
drop policy if exists tier_plans_admin_read on public.tier_plans;
create policy tier_plans_admin_read on public.tier_plans for select
  using (public.has_role(array['owner','admin','finance']));
drop policy if exists tier_plans_admin_write on public.tier_plans;
create policy tier_plans_admin_write on public.tier_plans for update
  using (public.has_role(array['owner','admin','finance']));

-- ── tier_prices ─────────────────────────────────────────────────────
alter table public.tier_prices enable row level security;
drop policy if exists tier_prices_admin_read on public.tier_prices;
create policy tier_prices_admin_read on public.tier_prices for select
  using (public.has_role(array['owner','admin','finance']));
drop policy if exists tier_prices_admin_write on public.tier_prices;
create policy tier_prices_admin_write on public.tier_prices for update
  using (public.has_role(array['owner','admin','finance']));
drop policy if exists tier_prices_admin_insert on public.tier_prices;
create policy tier_prices_admin_insert on public.tier_prices for insert
  with check (public.has_role(array['owner','admin','finance']));

-- ── tier_limits ─────────────────────────────────────────────────────
alter table public.tier_limits enable row level security;
drop policy if exists tier_limits_admin_read on public.tier_limits;
create policy tier_limits_admin_read on public.tier_limits for select
  using (public.has_role(array['owner','admin','finance']));
drop policy if exists tier_limits_admin_write on public.tier_limits;
create policy tier_limits_admin_write on public.tier_limits for update
  using (public.has_role(array['owner','admin','finance']));
drop policy if exists tier_limits_admin_insert on public.tier_limits;
create policy tier_limits_admin_insert on public.tier_limits for insert
  with check (public.has_role(array['owner','admin','finance']));

-- ── enforcement_flags (kill switch: owner/admin only, not finance) ──
alter table public.enforcement_flags enable row level security;
drop policy if exists enforcement_admin_read on public.enforcement_flags;
create policy enforcement_admin_read on public.enforcement_flags for select
  using (public.has_role(array['owner','admin']));
drop policy if exists enforcement_admin_write on public.enforcement_flags;
create policy enforcement_admin_write on public.enforcement_flags for update
  using (public.has_role(array['owner','admin']));

-- Admin write access to tier_subscriptions for manual grant/revoke
-- (comp accounts, refunds). Reads already exist for admins.
drop policy if exists tier_subs_admin_write on public.tier_subscriptions;
create policy tier_subs_admin_write on public.tier_subscriptions for update
  using (public.has_role(array['owner','admin','finance']));
drop policy if exists tier_subs_admin_insert on public.tier_subscriptions;
create policy tier_subs_admin_insert on public.tier_subscriptions for insert
  with check (public.has_role(array['owner','admin','finance']));

-- Admin read access to the webhook audit trail (payments feed in Finance).
drop policy if exists pwe_admin_read on public.payment_webhook_events;
create policy pwe_admin_read on public.payment_webhook_events for select
  using (public.has_role(array['owner','admin','finance']));

-- The app shows the live Protector price on its upgrade card. Active prices
-- are public information (they're on the checkout page) — allow anyone to
-- read ACTIVE rows only; inactive/experimental rows stay admin-only.
drop policy if exists tier_prices_public_read on public.tier_prices;
create policy tier_prices_public_read on public.tier_prices for select
  using (active = true);
