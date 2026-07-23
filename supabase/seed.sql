-- ─────────────────────────────────────────────────────────────
-- CrimeAI / PSCC — demo community seed (shared content for all users)
-- Run AFTER schema.sql. Safe to re-run (clears prior seed rows first).
-- Media references real crime/safety files in the app's /public/feed folder.
-- ─────────────────────────────────────────────────────────────
delete from public.posts where user_id is null;

insert into public.posts (id, user_id, kind, author, handle, color, verified, neighborhood, lat, lon, text, category, media_url, media_type, duration_sec, thread, tags, source, likes, comments, shares, created_at) values
-- reels (real video, night/patrol/safety)
(gen_random_uuid(), null, 'reel', 'Wynwood Pulse', 'wynwoodpulse', '#ec4899', true, 'Wynwood', 25.8010, -80.1990,
 'Wynwood after dark — busy, but heavy security and patrols out tonight. Stay with your group and watch your phones.', null, '/feed/clip-2099536.mp4', 'video', 18, null,
 array['wynwood','nightlife','safety'], null, 1840, 212, 96, now() - interval '14 minutes'),
(gen_random_uuid(), null, 'reel', 'SoBe Neighbors', 'sobeneighbors', '#6366f1', true, 'South Beach', 25.7826, -80.1341,
 'Ocean Dr right now: big crowd, lots of MDPD presence near 8th. Keep an eye on your stuff in the crowd.', null, '/feed/clip-3045163.mp4', 'video', 25, null,
 array['southbeach','patrol','live'], null, 3120, 388, 140, now() - interval '39 minutes'),
(gen_random_uuid(), null, 'reel', 'Aisha R.', 'aisha305', '#10b981', false, 'Edgewater', 25.7950, -80.1880,
 'Edgewater waterfront tonight — newly added lighting makes the walk feel a lot safer after dark.', null, '/feed/clip-1093662.mp4', 'video', 12, null,
 array['edgewater','lighting','live'], null, 720, 58, 33, now() - interval '64 minutes'),
-- thread
(gen_random_uuid(), null, 'thread', 'Brickell Watch', 'brickellwatch', '#0ea5e9', true, 'Brickell', 25.7607, -80.1918,
 'How to avoid car break-ins in Brickell', null, null, null, null,
 array['Never leave bags, chargers, or sunglasses visible. Around 80% of break-ins target visible items.',
       'Park in lit garages, not street spots, after 10pm.',
       'Report attempts here so the whole block gets the alert in real time.'],
 array['brickell','safetytips'], null, 940, 77, 210, now() - interval '70 minutes'),
-- image posts (crime-prevention themed)
(gen_random_uuid(), null, 'image', 'Aisha R.', 'aisha305', '#10b981', false, 'Edgewater', 25.7950, -80.1880,
 'We''re launching an Edgewater neighborhood watch — first meetup Thursday 7pm at the park. All neighbors welcome. Let''s look out for each other.', null, '/feed/crime-watch.jpg', 'image', null, null,
 array['edgewater','neighborhoodwatch'], null, 612, 54, 30, now() - interval '120 minutes'),
(gen_random_uuid(), null, 'image', 'Dwayne K.', 'dwaynek', '#14b8a6', false, 'Coconut Grove', 25.7282, -80.2436,
 'City finally fixed the streetlights on our block in the Grove. Walking home at night feels so much safer now — lighting really is crime prevention.', null, '/feed/crime-carnight.jpg', 'image', null, null,
 array['coconutgrove','lighting','safetytips'], null, 410, 22, 12, now() - interval '280 minutes'),
-- reports (drop map pins) with correlating photos
(gen_random_uuid(), null, 'report', 'Brickell Watch', 'brickellwatch', '#0ea5e9', true, 'Brickell', 25.7620, -80.1930,
 'Caught on a doorbell cam: group checking car door handles on the 1100 block of SW 2nd Ave around 1am. Lock up and bring valuables inside.', 'property', '/feed/crime-doorbell.jpg', 'image', null, null,
 array['brickell','breakin'], null, 320, 64, 88, now() - interval '22 minutes'),
(gen_random_uuid(), null, 'report', 'Carlos M.', 'carlos_mia', '#f59e0b', false, 'Little Havana', 25.7659, -80.2197,
 'Two MDPD units responding on SW 8th near 17th Ave. Looked like a minor crash — avoid the block for a bit.', 'hazard', '/feed/crime-police.jpg', 'image', null, null,
 array['littlehavana','police'], null, 96, 18, 9, now() - interval '130 minutes'),
(gen_random_uuid(), null, 'image', 'Gables Alert', 'gablesalert', '#22c55e', true, 'Coral Gables', 25.7215, -80.2684,
 'Porch-pirate season is here. A video doorbell is the cheapest deterrent there is — schedule deliveries for when you''re home and report thefts so we can map the hotspots.', null, '/feed/crime-doorbell.jpg', 'image', null, null,
 array['coralgables','packagetheft','safetytips'], null, 188, 31, 22, now() - interval '220 minutes'),
-- news with crime-relevant thumbnails
(gen_random_uuid(), null, 'news', 'Local 10 News', 'local10news', '#0284c7', true, 'Brickell', 25.7743, -80.1937,
 'Miami-Dade PD increases patrols in Brickell and Downtown ahead of weekend events.', null, '/feed/crime-police.jpg', 'image', null, null, null, 'Local 10 News', 210, 40, 33, now() - interval '35 minutes'),
(gen_random_uuid(), null, 'news', 'WSVN 7', 'wsvn7', '#0284c7', true, 'Downtown Miami', 25.7743, -80.1937,
 'City of Miami expands its real-time crime data dashboard with weekly updates.', null, '/feed/crime-patrol.jpg', 'image', null, null, null, 'WSVN 7', 150, 25, 18, now() - interval '110 minutes'),
(gen_random_uuid(), null, 'news', 'Miami Herald', 'miamiherald', '#0284c7', true, 'Wynwood', 25.7743, -80.1937,
 'Wynwood neighbors push for better lighting after a string of car break-ins.', null, '/feed/crime-carnight.jpg', 'image', null, null, null, 'Miami Herald', 320, 60, 44, now() - interval '190 minutes'),
(gen_random_uuid(), null, 'news', 'CBS Miami', 'cbsmiami', '#0284c7', true, 'Miami', 25.7743, -80.1937,
 'Hurricane season prep: county shares flood-zone and evacuation resources.', null, '/feed/img-beach.jpg', 'image', null, null, null, 'CBS Miami', 180, 30, 22, now() - interval '300 minutes');
