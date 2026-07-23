-- ══════════════════════════════════════════════════════════════════
-- CrimeAI / PSCC — personas become REAL users
-- Run AFTER schema.sql + seed.sql, connected as the postgres role.
--
-- What this does:
--   1. Creates a real auth account (email + password) for each of the 7
--      community personas, so they can actually log in.
--   2. Fills in their profiles (handle, phone, neighborhood, onboarded).
--   3. Attaches their seeded posts to their real user ids.
--   4. Wipes every mock counter, then rebuilds likes / comments /
--      follower counts from REAL rows in likes/comments/follows.
--      After this, no number in the app is fake.
--
-- Shared test password for all persona accounts: PSCC-Beta2026!
-- (rotate before public beta — see MIGRATION.md)
-- ══════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- profiles need a handle so real follower/following counts can be
-- looked up per user (also added to schema.sql for fresh installs)
alter table public.profiles add column if not exists handle text unique;

-- ── 1) real auth accounts ───────────────────────────────────────────
do $$
declare
  pw text := 'PSCC-Beta2026!';
  u record;
begin
  for u in
    select * from (values
      ('a0000000-0000-4000-8000-000000000001'::uuid, 'brickellwatch@crimeai.app', 'Brickell Watch'),
      ('a0000000-0000-4000-8000-000000000002'::uuid, 'carlos.m@crimeai.app',     'Carlos M.'),
      ('a0000000-0000-4000-8000-000000000003'::uuid, 'wynwoodpulse@crimeai.app', 'Wynwood Pulse'),
      ('a0000000-0000-4000-8000-000000000004'::uuid, 'aisha.r@crimeai.app',      'Aisha R.'),
      ('a0000000-0000-4000-8000-000000000005'::uuid, 'sobeneighbors@crimeai.app','SoBe Neighbors'),
      ('a0000000-0000-4000-8000-000000000006'::uuid, 'dwayne.k@crimeai.app',     'Dwayne K.'),
      ('a0000000-0000-4000-8000-000000000007'::uuid, 'gablesalert@crimeai.app',  'Gables Alert')
    ) as t(id, email, name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, crypt(pw, gen_salt('bf')),
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', u.name),
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    -- GoTrue requires a matching email identity for password login
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', u.id::text, now(), now(), now()
    ) on conflict (provider, provider_id) do nothing;
  end loop;
end $$;

-- ── 2) complete their profiles ──────────────────────────────────────
with p(id, handle, phone, neighborhood, lat, lon, address) as (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'brickellwatch', '+1 (305) 555-0142', 'Brickell',      25.7601, -80.1951, 'Brickell, Miami FL'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'carlos_mia',    '+1 (305) 555-0188', 'Little Havana', 25.7743, -80.2196, 'Little Havana, Miami FL'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'wynwoodpulse',  '+1 (305) 555-0117', 'Wynwood',       25.8010, -80.1994, 'Wynwood, Miami FL'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'aisha305',      '+1 (305) 555-0163', 'Edgewater',     25.7907, -80.1885, 'Edgewater, Miami FL'),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'sobeneighbors', '+1 (305) 555-0199', 'South Beach',   25.7826, -80.1341, 'South Beach, Miami FL'),
  ('a0000000-0000-4000-8000-000000000006'::uuid, 'dwaynek',       '+1 (305) 555-0124', 'Coconut Grove', 25.7126, -80.2570, 'Coconut Grove, Miami FL'),
  ('a0000000-0000-4000-8000-000000000007'::uuid, 'gablesalert',   '+1 (305) 555-0171', 'Coral Gables',  25.7215, -80.2684, 'Coral Gables, Miami FL')
)
update public.profiles pr set
  handle = p.handle, phone = p.phone, neighborhood = p.neighborhood,
  lat = p.lat, lon = p.lon, address = p.address,
  radius_miles = 1.5, onboarded = true
from p where pr.id = p.id;

-- ── 3) attach seeded posts to their real owners ─────────────────────
update public.posts po set user_id = pr.id
from public.profiles pr
where pr.handle = po.handle and po.user_id is null;

-- ── 4) kill every mock number, rebuild from real rows ───────────────
-- counters to zero (likes/comments are trigger-maintained from here on)
update public.posts set likes = 0, comments = 0, shares = 0;
-- a seeded "live" stream that is never actually live is a mock too:
-- it becomes an honest LIVE REPLAY with no fake viewer count
update public.posts set is_live = false, viewers = null where is_live = true;

-- real follow graph between the community accounts
insert into public.follows (follower_id, target_handle)
select pr.id, f.target from public.profiles pr
join (values
  ('brickellwatch', 'sobeneighbors'), ('brickellwatch', 'wynwoodpulse'),
  ('brickellwatch', 'gablesalert'),   ('brickellwatch', 'carlos_mia'),
  ('carlos_mia', 'brickellwatch'),    ('carlos_mia', 'sobeneighbors'),   ('carlos_mia', 'aisha305'),
  ('wynwoodpulse', 'brickellwatch'),  ('wynwoodpulse', 'sobeneighbors'), ('wynwoodpulse', 'dwaynek'),
  ('aisha305', 'brickellwatch'),      ('aisha305', 'gablesalert'),
  ('aisha305', 'carlos_mia'),         ('aisha305', 'sobeneighbors'),
  ('sobeneighbors', 'brickellwatch'), ('sobeneighbors', 'wynwoodpulse'),
  ('dwaynek', 'brickellwatch'),       ('dwaynek', 'sobeneighbors'),
  ('dwaynek', 'gablesalert'),         ('dwaynek', 'aisha305'),
  ('gablesalert', 'brickellwatch'),   ('gablesalert', 'sobeneighbors'),  ('gablesalert', 'aisha305')
) as f(follower, target) on f.follower = pr.handle
on conflict do nothing;

-- real likes: each account likes a varied subset of the others' posts
-- (deterministic spread; the trigger keeps posts.likes in sync)
insert into public.likes (user_id, post_id)
select pr.id, po.id
from public.profiles pr
cross join public.posts po
where pr.handle is not null
  and (po.user_id is null or po.user_id <> pr.id)          -- never like your own post
  and abs(hashtext(pr.handle || po.id::text)) % 10 < 6      -- varied, deterministic spread
on conflict do nothing;

-- real comments from real accounts (trigger keeps posts.comments in sync)
insert into public.comments (post_id, user_id, author, text)
select po.id, pr.id, prname.name, c.body
from (values
  ('brickellwatch', 'carlos_mia',    'Sharing this with my block group — thank you for posting.'),
  ('brickellwatch', 'aisha305',      'This is why we organized our watch. Great info.'),
  ('brickellwatch', 'sobeneighbors', 'Same pattern we saw on Collins last month. Stay alert.'),
  ('sobeneighbors', 'wynwoodpulse',  'Appreciate the heads up — cross-posting to our nightlife group.'),
  ('sobeneighbors', 'dwaynek',       'Called it in as well. More reports = faster response.'),
  ('wynwoodpulse',  'brickellwatch', 'Good coverage. Verified with two residents in the area.'),
  ('aisha305',      'gablesalert',   'Lighting petition worked in the Gables — happy to share our template.'),
  ('carlos_mia',    'brickellwatch', 'Reported. Keep an eye out tonight, neighbors.')
) as c(post_handle, commenter, body)
join lateral (
  select id from public.posts where handle = c.post_handle order by created_at desc limit 1
) po on true
join public.profiles pr on pr.handle = c.commenter
join public.profiles prname on prname.handle = c.commenter
on conflict do nothing;

-- sync counters to the real rows (covers pre-existing rows the triggers missed)
update public.posts p set
  likes    = (select count(*) from public.likes l where l.post_id = p.id),
  comments = (select count(*) from public.comments c where c.post_id = p.id);
