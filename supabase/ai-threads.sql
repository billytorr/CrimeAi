-- ═══════════════════════════════════════════════════════════════════
-- CrimeAI conversation threads (ChatGPT-style)
--
-- Persisted per user so a conversation survives app restarts and syncs
-- across devices. Multiple threads (the sidebar) is a Protector feature;
-- free users get a single rolling thread, enforced in the app, but the data
-- model is the same for both so upgrading just unlocks the drawer.
--
-- Personal-memory note (DATA-GOVERNANCE §5a): these rows ARE the user's
-- assistant memory. Own-row RLS keeps one user's threads private to them;
-- deleting a thread deletes its messages (cascade), which is how "erase my
-- memory" is honoured immediately.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.ai_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  title       text not null default 'New chat',
  -- optional: the post this thread was started from ("ask about this")
  post_id     uuid references public.posts on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ai_threads_user_idx on public.ai_threads (user_id, updated_at desc);

create table if not exists public.ai_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.ai_threads on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,  -- denormalised for RLS
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  engine      text,             -- anthropic | fallback | ollama, for the reply
  created_at  timestamptz not null default now()
);
create index if not exists ai_messages_thread_idx on public.ai_messages (thread_id, created_at);

alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;

-- Own-row only, all operations. A user fully owns their conversations:
-- read, create, rename, delete.
drop policy if exists ai_threads_own on public.ai_threads;
create policy ai_threads_own on public.ai_threads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists ai_messages_own on public.ai_messages;
create policy ai_messages_own on public.ai_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bump the thread's updated_at whenever a message lands, so the drawer sorts
-- most-recent-first without the client having to touch the thread row.
create or replace function public.touch_ai_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.ai_threads set updated_at = now() where id = new.thread_id;
  return null;
end;
$$;
drop trigger if exists touch_ai_thread_trg on public.ai_messages;
create trigger touch_ai_thread_trg after insert on public.ai_messages
  for each row execute function public.touch_ai_thread();
