-- ══════════════════════════════════════════════════════════════════
-- Subscription lifecycle (provider-agnostic) — the tables a real
-- payments platform tracks, regardless of merchant:
--   subscriptions: one row per user subscription, updated by webhooks
--   payments: gains provider + external id so ANY merchant's charges
--             reconcile cleanly
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users on delete cascade,
  provider                 text not null,               -- stripe | chase | braintree | …
  provider_customer_id     text,
  provider_subscription_id text unique,
  status                   text not null default 'active',  -- active | past_due | canceled
  price_cents              int,
  current_period_end       timestamptz,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);
create index if not exists subs_user on public.subscriptions (user_id);
alter table public.subscriptions enable row level security;
drop policy if exists subs_read on public.subscriptions;
create policy subs_read on public.subscriptions for select
  using (auth.uid() = user_id or public.has_role(array['owner','admin','finance']));
-- writes come ONLY from the server webhook (service role bypasses RLS)

alter table public.payments add column if not exists provider text default '';
alter table public.payments add column if not exists external_id text;
