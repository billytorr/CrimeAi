-- ═══════════════════════════════════════════════════════════════════
-- CrimeAI durable user memory (master-prompt §16 User Memory).
--
-- Facts CrimeAI persistently remembers about a user ACROSS conversations —
-- like ChatGPT's memory. Distinct from ai-user-context, which reads live
-- profile data each turn; this is what the user (or the assistant, when it
-- learns something durable) chooses to have remembered.
--
-- OWN-ROW ONLY. Never crosses users. The user can see and delete every item
-- (transparency + control is a privacy requirement, DATA-GOVERNANCE).
--
-- ⚠️ NO biometric, ID, payment, or precise-address data here — enforced by
-- convention + the app never writing it. This is preferences/context, not PII.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.crimeai_user_memory (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  fact        text not null,
  source      text not null default 'assistant',   -- assistant | user
  created_at  timestamptz not null default now()
);
create index if not exists crimeai_user_memory_user_idx
  on public.crimeai_user_memory (user_id, created_at desc);

-- Dedupe identical facts per user.
create unique index if not exists crimeai_user_memory_dedupe
  on public.crimeai_user_memory (user_id, lower(fact));

alter table public.crimeai_user_memory enable row level security;
drop policy if exists crimeai_memory_own on public.crimeai_user_memory;
create policy crimeai_memory_own on public.crimeai_user_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cap at 50 facts/user: keep the newest, drop the oldest. Memory is a rolling
-- window, not an unbounded dossier.
create or replace function public.cap_user_memory() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.crimeai_user_memory
   where user_id = new.user_id
     and id not in (
       select id from public.crimeai_user_memory
       where user_id = new.user_id
       order by created_at desc limit 50
     );
  return null;
end;
$$;
drop trigger if exists cap_user_memory_trg on public.crimeai_user_memory;
create trigger cap_user_memory_trg after insert on public.crimeai_user_memory
  for each row execute function public.cap_user_memory();
