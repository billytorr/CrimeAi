-- Phase 3: Protector badge driven by LIVE entitlement.
--
-- Every badge in the app renders from profiles.plan (feed authors, profiles,
-- search, self view). This migration makes profiles.plan a PROJECTION of
-- tier_subscriptions: any change to a subscription row (checkout, webhook
-- cancel/suspend, reconciliation grace sweep, Command Center comp/revoke)
-- re-projects the flag automatically. No client code changes needed — the
-- badge follows real billing everywhere at once.
--
-- Grace note: a past_due subscriber keeps the badge through their grace
-- window (effective_plan_of honors grace); the daily reconciliation sweep
-- flips status at grace end, which re-fires this trigger.

create or replace function public.project_plan_to_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; eff text;
begin
  uid := coalesce(NEW.user_id, OLD.user_id);
  eff := public.effective_plan_of(uid);   -- reads committed row state (AFTER trigger)
  update public.profiles set
    plan      = eff,
    pro_since = case when eff <> 'free' then coalesce(pro_since, now()) else pro_since end
  where id = uid and plan is distinct from eff;
  return null; -- AFTER trigger: return value ignored
end;
$$;

drop trigger if exists tier_subs_project_plan on public.tier_subscriptions;
create trigger tier_subs_project_plan
  after insert or update or delete on public.tier_subscriptions
  for each row execute function public.project_plan_to_profile();

-- ── one-time backfill ───────────────────────────────────────────────
-- 1) Legacy manual pro flags (set before the tier system existed) become
--    real COMPED subscriptions, so the badge they already show is now
--    backed by live entitlement instead of a loose column.
insert into public.tier_subscriptions (user_id, plan_id, price_id, status, current_period_start)
select id, 'pro', null, 'active', coalesce(pro_since, now())
from public.profiles where plan = 'pro'
on conflict (user_id) do nothing;

-- 2) Re-project every profile from the live truth.
update public.profiles p
set plan = public.effective_plan_of(p.id)
where p.plan is distinct from public.effective_plan_of(p.id);
