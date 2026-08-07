-- ═══════════════════════════════════════════════════════════════════
-- Pricing page: plan display fields, coming-soon plans, annual price
--
-- tier_plans held only id/name/active — enough to bill against, not enough
-- to render a comparison chart. Everything the pricing page shows is config
-- so copy and prices change in the Command Center, never in a deploy.
--
-- Guardian and Community are deliberately COMING SOON with no price and no
-- features: they exist to be seen next to Protector while their shape is
-- decided from launch feedback. `status` — not a null price — is what marks
-- them, so a plan can never accidentally become purchasable by someone
-- filling in an amount.
-- ═══════════════════════════════════════════════════════════════════

alter table public.tier_plans add column if not exists status      text not null default 'live';
alter table public.tier_plans add column if not exists tagline     text;
alter table public.tier_plans add column if not exists blurb       text;
alter table public.tier_plans add column if not exists features    jsonb not null default '[]'::jsonb;
alter table public.tier_plans add column if not exists sort_order  int not null default 100;
alter table public.tier_plans add column if not exists highlight   boolean not null default false;

do $$ begin
  alter table public.tier_plans add constraint tier_plans_status_ck
    check (status in ('live', 'coming_soon', 'hidden'));
exception when duplicate_object then null; end $$;

-- ── Free ───────────────────────────────────────────────────────────
update public.tier_plans set
  tagline = 'Everything you need to stay aware',
  blurb   = 'Real incidents near you, the map, the feed, and every safety feature. Always free.',
  features = '[
    "Alerts within 1 mile",
    "Live incident map",
    "Ask CrimeAI",
    "SOS + trusted circle",
    "Post and comment"
  ]'::jsonb,
  sort_order = 10,
  status = 'live'
where id = 'free';

-- ── Protector (the only purchasable paid plan) ─────────────────────
update public.tier_plans set
  name = 'Protector',
  tagline = 'For neighbors who watch out for everyone',
  blurb   = 'A wider radius, deeper history, and the red shield beside your name.',
  features = '[
    "Alerts up to 5 miles",
    "Full incident history",
    "Deeper Safety Score breakdown",
    "Larger trusted circle",
    "Text (SMS) alerts",
    "Red Protector shield",
    "Priority support"
  ]'::jsonb,
  sort_order = 20,
  highlight = true,
  status = 'live'
where id = 'pro';

-- ── Coming soon ────────────────────────────────────────────────────
-- No price rows on purpose. Pricing and features come from what users
-- actually ask for after launch, not from guesses made before it.
insert into public.tier_plans (id, name, active, status, tagline, blurb, features, sort_order)
values
  ('guardian', 'Guardian', true, 'coming_soon',
   'For the people holding the block together',
   'More reach, more tools, and a bigger say in what happens on your block. Shaped by what Protectors tell us they need.',
   '[]'::jsonb, 30),
  ('community', 'Community', true, 'coming_soon',
   'For buildings, HOAs and block associations',
   'One plan covering a whole building or association, with shared alerts and a group view. In design.',
   '[]'::jsonb, 40)
on conflict (id) do update set
  name = excluded.name, status = excluded.status, tagline = excluded.tagline,
  blurb = excluded.blurb, sort_order = excluded.sort_order;

-- ── Annual Protector ───────────────────────────────────────────────
-- $69.99/yr against $7.99/mo ($95.88) — the page computes the discount and
-- the months-free figure from these two numbers rather than hardcoding a
-- badge that quietly goes stale when a price changes.
insert into public.tier_prices (id, plan_id, amount_cents, interval, label, active)
values ('pro_annual_6999', 'pro', 6999, 'year', 'Protector annual $69.99', true)
on conflict (id) do update set
  amount_cents = excluded.amount_cents, interval = excluded.interval,
  label = excluded.label, active = excluded.active;

-- The $4.99 arm was the original A/B test; $7.99 is the agreed price, so
-- retire 4.99 rather than leave two monthly amounts live and have the
-- pricing page pick one arbitrarily.
update public.tier_prices set active = false where id = 'pro_499';

-- Plans are public reading material — the pricing page must render for a
-- signed-out visitor. Prices likewise. Neither contains anything private.
alter table public.tier_plans enable row level security;
drop policy if exists tier_plans_public_read on public.tier_plans;
create policy tier_plans_public_read on public.tier_plans for select using (true);

alter table public.tier_prices enable row level security;
drop policy if exists tier_prices_public_read on public.tier_prices;
create policy tier_prices_public_read on public.tier_prices for select using (active);
