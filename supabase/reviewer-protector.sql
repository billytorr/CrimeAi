-- App Review demo account with an ACTIVE Protector entitlement (App Store
-- remediation Phase 5). Reviewers must see the paid experience without
-- transacting. Run in the SQL Editor before submission; idempotent.
--
-- 1) Set the review password (CHANGE 'REVIEW-PASSWORD-HERE' first, then put
--    the same value in App Store Connect → App Review Information).
update auth.users
   set encrypted_password = crypt('REVIEW-PASSWORD-HERE', gen_salt('bf'))
 where email = 'reviewer@crimeai.app';

-- 2) Active Protector subscription for one year, no Authorize.Net id —
--    entitlement is real (served by the backend like any subscriber), there is
--    just no card on file. The in-app cancel responds "no active subscription
--    found", which is accurate for a comped account.
insert into public.tier_subscriptions
  (user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end)
select u.id, 'pro', 'active', now(), now() + interval '1 year', false
  from auth.users u
 where u.email = 'reviewer@crimeai.app'
on conflict (user_id) do update
   set plan_id = 'pro', status = 'active',
       current_period_start = now(), current_period_end = now() + interval '1 year',
       cancel_at_period_end = false, updated_at = now();

-- 3) Verify: expect one row, plan 'pro', status 'active'.
select u.email, s.plan_id, s.status, s.current_period_end
  from public.tier_subscriptions s join auth.users u on u.id = s.user_id
 where u.email = 'reviewer@crimeai.app';
