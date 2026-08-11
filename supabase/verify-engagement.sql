-- Verify that ALL feed engagement is backed by real accounts and real rows.
-- Run this before AND after personas.sql. Every row should read OK.
--   • before personas.sql: expect FAKE / MISMATCH rows (seed.sql left mock data)
--   • after  personas.sql: every row OK — no number in the app is fake

select 'ownerless posts (author has no real account)' as check,
       count(*)::text as value,
       case when count(*) = 0 then 'OK' else 'FAKE → apply personas.sql' end as status
from public.posts where user_id is null

union all
select 'posts whose like count <> real like rows',
       count(*)::text,
       case when count(*) = 0 then 'OK' else 'MISMATCH → re-run personas.sql' end
from public.posts p
where p.likes <> (select count(*) from public.likes l where l.post_id = p.id)

union all
select 'posts whose comment count <> real comment rows',
       count(*)::text,
       case when count(*) = 0 then 'OK' else 'MISMATCH → re-run personas.sql' end
from public.posts p
where p.comments <> (select count(*) from public.comments c where c.post_id = p.id)

union all
select 'likes pointing at a non-existent user',
       count(*)::text,
       case when count(*) = 0 then 'OK' else 'ORPHAN LIKES' end
from public.likes l
where not exists (select 1 from auth.users u where u.id = l.user_id)

union all
select 'comments pointing at a non-existent user',
       count(*)::text,
       case when count(*) = 0 then 'OK' else 'ORPHAN COMMENTS' end
from public.comments c
where not exists (select 1 from auth.users u where u.id = c.user_id)

union all
select 'community persona accounts that can log in',
       count(*)::text,
       case when count(*) = 7 then 'OK (7)' else 'run personas.sql' end
from auth.users where email like '%@crimeai.app';
