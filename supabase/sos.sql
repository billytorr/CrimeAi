-- Settings → Emergency SOS: per-user on/off for the floating SOS button
alter table public.profiles add column if not exists sos_enabled boolean default true;
