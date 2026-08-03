-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 — Tier system data model
--
-- Design rules honored here:
--   • Rule 4 (no hardcoded config): every price and limit lives in a DB
--     table that can be changed without a deploy. Code reads these.
--   • Rule 4 (multiple concurrent price points): `prices` allows many
--     active rows; the chosen one is stamped onto the subscription and
--     honored for the life of that subscription.
--   • Rule 5 (race-safe, period-anchored counters): usage_counters +
--     the consume_usage() function increment atomically and reset on the
--     user's billing-period boundary (free users anchor to created_at).
--   • Rule 7 (grace, not instant revoke): subscriptions carry grace_until.
--   • Rule 9 (gateway is not truth): entitlement reads these tables only,
--     never Authorize.Net.
--
-- Everything is ADDITIVE. Nothing in the running app reads these yet.
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- ── Plans (the tiers) ───────────────────────────────────────────────
create table if not exists public.tier_plans (
  id          text primary key,               -- 'free' | 'pro'   (pro = Protector)
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz default now()
);
insert into public.tier_plans (id, name) values
  ('free', 'Free'),
  ('pro',  'Protector')
on conflict (id) do nothing;

-- ── Prices (multiple concurrent active price points — the A/B test) ──
create table if not exists public.tier_prices (
  id           text primary key,              -- 'pro_499' | 'pro_799' | ...
  plan_id      text not null references public.tier_plans(id),
  amount_cents int not null,
  currency     text not null default 'usd',
  interval     text not null default 'month', -- month | year
  label        text,                          -- internal label for the experiment arm
  active       boolean not null default true, -- several can be active at once
  created_at   timestamptz default now()
);
insert into public.tier_prices (id, plan_id, amount_cents, label) values
  ('pro_499', 'pro', 499, 'A/B arm $4.99'),
  ('pro_799', 'pro', 799, 'A/B arm $7.99')
on conflict (id) do nothing;

-- ── Plan limits (ALL numbers from the tier matrix — config, no deploy) ─
-- value is jsonb so a limit can be a number, boolean, or small object
-- (e.g. the dynamic free-radius {start,cap,threshold}).
create table if not exists public.tier_limits (
  plan_id     text not null references public.tier_plans(id),
  capability  text not null,
  value       jsonb not null,
  updated_at  timestamptz default now(),
  updated_by  text,
  primary key (plan_id, capability)
);

-- Seed the defaults from the TIER MATRIX. Change these rows to retune
-- gates without a deploy.
insert into public.tier_limits (plan_id, capability, value) values
  -- map history window (days)
  ('free', 'map_history_days', '7'),
  ('pro',  'map_history_days', '90'),
  -- saved locations
  ('free', 'saved_locations', '1'),
  ('pro',  'saved_locations', '5'),
  -- alert radius (miles). free is dynamic 1→cap until activity threshold.
  ('free', 'alert_radius', '{"dynamic":true,"start":1,"cap":3,"min_incidents_30d":8}'),
  ('pro',  'alert_radius', '{"dynamic":false,"max":10}'),
  -- address search (per billing period). free is blocked (0).
  ('free', 'address_search', '0'),
  ('pro',  'address_search', '100'),
  -- AI analytical queries (per period). retrieval is unlimited both tiers.
  ('free', 'ai_analytical', '5'),
  ('pro',  'ai_analytical', '150'),
  -- immediate SMS alerts (per period). digest is separate + unmetered.
  ('free', 'sms_immediate', '0'),
  ('pro',  'sms_immediate', '100'),
  -- delivery channels
  ('free', 'channels', '["push"]'),
  ('pro',  'channels', '["push","email","sms"]'),
  -- trusted circle size
  ('free', 'trusted_circle', '3'),
  ('pro',  'trusted_circle', '15'),
  -- safety score depth
  ('free', 'safety_score_depth', '"current"'),
  ('pro',  'safety_score_depth', '"full"'),
  -- boolean perks
  ('free', 'protector_badge', 'false'),
  ('pro',  'protector_badge', 'true'),
  ('free', 'priority_visibility', 'false'),
  ('pro',  'priority_visibility', 'true'),
  ('free', 'early_access', 'false'),
  ('pro',  'early_access', 'true')
on conflict (plan_id, capability) do nothing;

-- ── Subscriptions (OUR source of truth — Rule 9) ────────────────────
-- Extends the earlier subscriptions concept with everything the tier
-- system needs. anet_* columns are populated in Phase 1B.
create table if not exists public.tier_subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users on delete cascade,
  plan_id                 text not null references public.tier_plans(id) default 'free',
  price_id                text references public.tier_prices(id),        -- which A/B arm
  status                  text not null default 'active',                -- active | grace | past_due | canceled | expired
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  grace_until             timestamptz,                                   -- Rule 7
  cancel_at_period_end    boolean not null default false,
  anet_subscription_id    text,                                          -- ARB id (Phase 1B)
  anet_customer_profile_id text,
  card_last4              text,                                          -- display only
  card_brand              text,                                          -- display only
  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),
  unique (user_id)
);
create index if not exists tier_subs_status on public.tier_subscriptions (status);
alter table public.tier_subscriptions enable row level security;
drop policy if exists tier_subs_read on public.tier_subscriptions;
create policy tier_subs_read on public.tier_subscriptions for select
  using (auth.uid() = user_id or public.has_role(array['owner','admin','finance']));
-- writes: service role only (webhook/reconciliation) — no write policy on purpose

-- ── Usage counters (Rule 5: atomic, period-anchored) ────────────────
create table if not exists public.usage_counters (
  user_id       uuid not null references auth.users on delete cascade,
  capability    text not null,
  period_start  timestamptz not null,   -- billing-period boundary (or account anchor for free)
  count         int not null default 0,
  updated_at    timestamptz default now(),
  primary key (user_id, capability, period_start)
);
alter table public.usage_counters enable row level security;
drop policy if exists usage_read on public.usage_counters;
create policy usage_read on public.usage_counters for select
  using (auth.uid() = user_id or public.has_role(array['owner','admin','finance']));

-- Atomic consume: increments the counter for the current period and
-- returns whether the request is ALLOWED under `limit_value`. The whole
-- check-and-increment is one statement, so concurrent callers can never
-- both slip past the limit (Rule 5). limit_value < 0 means "unlimited".
create or replace function public.consume_usage(
  p_user uuid,
  p_capability text,
  p_period_start timestamptz,
  p_amount int,
  p_limit int
) returns table (allowed boolean, new_count int) as $$
declare
  v_count int;
begin
  insert into public.usage_counters (user_id, capability, period_start, count)
    values (p_user, p_capability, p_period_start, 0)
    on conflict (user_id, capability, period_start) do nothing;

  if p_limit is not null and p_limit >= 0 then
    -- only increments if it stays within the limit; row is locked for the txn
    update public.usage_counters
      set count = count + p_amount, updated_at = now()
      where user_id = p_user and capability = p_capability and period_start = p_period_start
        and count + p_amount <= p_limit
      returning count into v_count;
    if found then
      return query select true, v_count;
    else
      select count into v_count from public.usage_counters
        where user_id = p_user and capability = p_capability and period_start = p_period_start;
      return query select false, v_count;
    end if;
  else
    -- unlimited: always increment, always allowed
    update public.usage_counters
      set count = count + p_amount, updated_at = now()
      where user_id = p_user and capability = p_capability and period_start = p_period_start
      returning count into v_count;
    return query select true, v_count;
  end if;
end;
$$ language plpgsql security definer;

-- ── Enforcement kill switch per market (Phase 2 uses it; declared now) ─
create table if not exists public.enforcement_flags (
  market   text primary key,              -- 'miami' | 'default' | ...
  enabled  boolean not null default false,
  updated_at timestamptz default now()
);
insert into public.enforcement_flags (market, enabled) values ('default', false)
on conflict (market) do nothing;
