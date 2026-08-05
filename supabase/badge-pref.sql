-- Protector badge display preference: each paying subscriber may hide their
-- badge. Default TRUE (shown). The badge itself is still gated by live
-- entitlement (profiles.plan projection) — this only controls display.
alter table public.profiles add column if not exists show_pro_badge boolean not null default true;
