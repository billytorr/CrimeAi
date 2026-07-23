-- ══════════════════════════════════════════════════════════════════
-- Legal documents (Terms of Service + Privacy Policy)
--   • versioned; the Command Center publishes new versions
--   • published docs are publicly readable (signup shows them pre-auth)
--   • every acceptance is recorded per user + version + timestamp —
--     the evidence that makes the agreement enforceable
-- ══════════════════════════════════════════════════════════════════
set search_path = public, extensions;

create table if not exists public.legal_documents (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,             -- terms | privacy
  version    int not null,
  title      text not null,
  body       text not null,
  published  boolean default true,
  created_by text default '',
  created_at timestamptz default now(),
  unique (kind, version)
);
alter table public.legal_documents enable row level security;
drop policy if exists legal_public_read on public.legal_documents;
create policy legal_public_read on public.legal_documents for select
  using (published or public.is_admin());
drop policy if exists legal_admin_write on public.legal_documents;
create policy legal_admin_write on public.legal_documents for insert
  with check (public.has_role(array['owner','admin']));
drop policy if exists legal_admin_update on public.legal_documents;
create policy legal_admin_update on public.legal_documents for update
  using (public.has_role(array['owner','admin']));

create table if not exists public.legal_acceptances (
  user_id     uuid references auth.users on delete cascade,
  doc_kind    text not null,
  version     int not null,
  accepted_at timestamptz default now(),
  primary key (user_id, doc_kind, version)
);
alter table public.legal_acceptances enable row level security;
drop policy if exists accept_insert on public.legal_acceptances;
create policy accept_insert on public.legal_acceptances for insert
  with check (auth.uid() = user_id);
drop policy if exists accept_read on public.legal_acceptances;
create policy accept_read on public.legal_acceptances for select
  using (auth.uid() = user_id or public.is_admin());
