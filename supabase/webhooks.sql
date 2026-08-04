-- Phase 1B-ii: payment webhook idempotency + audit.
-- Every Authorize.Net webhook is recorded here BEFORE it's acted on. The
-- notification_id primary key makes processing idempotent: a duplicate
-- delivery (Authorize.Net retries) inserts nothing and is skipped, so a
-- replayed event can never double-apply a status change.
create table if not exists public.payment_webhook_events (
  notification_id text primary key,          -- Authorize.Net notificationId
  event_type      text,
  subscription_id text,                       -- ARB subscription id when present
  status          text not null default 'received', -- received | processed | ignored | error
  error           text,
  payload         jsonb,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz
);
create index if not exists pwe_sub on public.payment_webhook_events (subscription_id);
create index if not exists pwe_received on public.payment_webhook_events (received_at desc);

-- Store the receipt email chosen at checkout so webhooks/reconciliation can
-- email the customer without joining auth.users (falls back to profiles.email).
alter table public.tier_subscriptions add column if not exists receipt_email text;
-- Lookups by ARB subscription id (webhook + reconciliation hot path).
create index if not exists tier_subs_anet on public.tier_subscriptions (anet_subscription_id);

-- Service-role only. RLS on + no policy = no anon/user access; the webhook
-- route uses the service role (bypasses RLS) to read/write.
alter table public.payment_webhook_events enable row level security;

-- Atomic idempotent claim: insert the event; returns TRUE only for the FIRST
-- caller to see this notification_id. Concurrent duplicate deliveries → only
-- one gets TRUE, the rest get FALSE and skip processing (no double-apply).
create or replace function public.claim_webhook_event(
  p_notification_id text, p_event_type text, p_subscription_id text, p_payload jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare inserted boolean;
begin
  insert into public.payment_webhook_events (notification_id, event_type, subscription_id, payload)
  values (p_notification_id, p_event_type, p_subscription_id, p_payload)
  on conflict (notification_id) do nothing;
  get diagnostics inserted = row_count;
  return inserted = 1;
end;
$$;
