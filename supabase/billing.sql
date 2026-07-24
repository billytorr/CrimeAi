-- ══════════════════════════════════════════════════════════════════
-- Billing: Free plan + Protector Plan ($9.11/mo)
--   • profiles.plan free|pro (+ pro badge everywhere in the app)
--   • plans — editable pricing/benefits matrix (Command Center → Finance)
--   • payments — every charge recorded (webhook-written, service role)
--   • 'finance' Command Center role
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists pro_since timestamptz;
alter table public.profiles add column if not exists stripe_customer_id text;

create table if not exists public.plans (
  id          text primary key,              -- free | pro
  name        text not null,
  tagline     text default '',
  price_cents int not null default 0,        -- pro: 911 = $9.11
  features    jsonb not null default '[]',   -- array of benefit strings
  updated_by  text default '',
  updated_at  timestamptz default now()
);
alter table public.plans enable row level security;
drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select using (true);
drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for update
  using (public.has_role(array['owner','admin','finance']));

insert into public.plans (id, name, tagline, price_cents, features) values
  ('free', 'Neighbor', 'Everything you need to stay aware', 0,
   '["Local feed, map and alerts","Post, report and message neighbors","CrimeAI safety conversations","SOS and trusted circle"]'),
  ('pro', 'Protector Plan', 'For the neighbors who keep the block safe', 911,
   '["Red Protector badge on your profile and posts","Priority visibility for your reports","Extended alert radius (up to 10 mi)","Early access to new safety features","Support the mission — keep CrimeAI independent"]')
on conflict (id) do nothing;

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users on delete set null,
  email           text default '',
  amount_cents    int not null,
  currency        text default 'usd',
  kind            text default 'subscription',   -- subscription | renewal
  stripe_session  text,
  stripe_invoice  text,
  status          text default 'paid',
  created_at      timestamptz default now()
);
alter table public.payments enable row level security;
-- written ONLY by the server webhook (service role bypasses RLS);
-- readable by finance/admin/owner in the Command Center
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select
  using (public.has_role(array['owner','admin','finance']) or auth.uid() = user_id);

-- payment provider selection (merchant-agnostic: stripe, chase, square…)
-- Secret keys NEVER live here — they stay in server env vars; this table
-- holds the choice + non-secret config so the Command Center can manage it.
create table if not exists public.payment_config (
  id          int primary key default 1 check (id = 1),  -- single row
  provider    text not null default 'none',               -- none|stripe|chase|square|authorize
  currency    text not null default 'usd',
  notes       text default '',
  updated_by  text default '',
  updated_at  timestamptz default now()
);
insert into public.payment_config (id) values (1) on conflict do nothing;
alter table public.payment_config enable row level security;
drop policy if exists payconf_read on public.payment_config;
create policy payconf_read on public.payment_config for select using (true);
drop policy if exists payconf_write on public.payment_config;
create policy payconf_write on public.payment_config for update
  using (public.has_role(array['owner','admin','finance']));
