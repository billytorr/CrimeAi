-- Push notification delivery (ADDITIVE).
-- `profiles.alert_channels.push` has always been a stored preference with
-- nothing behind it; this is the delivery side.
--
-- Rule 1 note: this table is data only. Safety dispatch (SOS / Trusted Circle)
-- must never gate on scoring/tier/identity — a device token lookup is not a
-- gate, and the send path stays free of every such check.
--
-- Reversal:
--   drop table if exists public.push_deliveries;
--   drop table if exists public.device_tokens;

create table if not exists public.device_tokens (
  token        text primary key,              -- APNs/FCM registration token
  user_id      uuid not null references auth.users on delete cascade,
  platform     text not null check (platform in ('ios','android','web')),
  environment  text not null default 'production' check (environment in ('production','sandbox')),
  app_version  text,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  disabled_at  timestamptz                    -- set when the provider reports the token dead
);
create index if not exists device_tokens_user on public.device_tokens (user_id) where disabled_at is null;
alter table public.device_tokens enable row level security;

-- A user may register/refresh/remove their OWN device tokens.
drop policy if exists device_tokens_own on public.device_tokens;
create policy device_tokens_own on public.device_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Delivery log — dedupe + debugging + provider feedback (dead tokens).
create table if not exists public.push_deliveries (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users on delete set null,
  token       text,
  kind        text not null,                  -- alert | safety | system
  dedupe_key  text,                           -- one notification per user per event
  status      text not null default 'sent' check (status in ('sent','failed','skipped')),
  error       text,
  created_at  timestamptz not null default now()
);
create unique index if not exists push_dedupe on public.push_deliveries (user_id, dedupe_key)
  where dedupe_key is not null and status = 'sent';
create index if not exists push_deliveries_recent on public.push_deliveries (created_at desc);
alter table public.push_deliveries enable row level security;
-- service role only (no policy)
