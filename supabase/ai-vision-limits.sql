-- ai_vision metered limit — image/file analysis is Protector-only.
-- Free tier gets 0 (blocked, with an upsell); Protector gets a generous cap.
-- Idempotent.
insert into public.tier_limits (plan_id, capability, value) values
  ('free', 'ai_vision', '0'),
  ('pro',  'ai_vision', '100')
on conflict (plan_id, capability) do update set value = excluded.value;
