-- ══════════════════════════════════════════════════════════════════
-- PHASE 1B — Authorize.Net checkout handoff
--   checkout_nonces: single-use nonces so a signed checkout token can't
--   be replayed (Rule: nonce single-use). Written server-side only.
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

create table if not exists public.checkout_nonces (
  nonce       text primary key,
  user_id     uuid not null references auth.users on delete cascade,
  price_id    text,
  used_at     timestamptz,               -- set when redeemed; a second redeem is rejected
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);
create index if not exists checkout_nonces_exp on public.checkout_nonces (expires_at);
alter table public.checkout_nonces enable row level security;
-- no policies: service-role only (the token endpoints run server-side)

-- Atomic single-use redemption: marks the nonce used and returns true ONLY
-- the first time. Concurrent redeems can never both succeed.
create or replace function public.redeem_nonce(p_nonce text)
returns boolean as $$
declare ok boolean;
begin
  update public.checkout_nonces
    set used_at = now()
    where nonce = p_nonce and used_at is null and expires_at > now()
    returning true into ok;
  return coalesce(ok, false);
end;
$$ language plpgsql security definer;
