-- Voice + web are Protector-only, metered per billing period.
-- Conservative defaults — tune in Command Center against real vendor pricing.
-- (Voice especially: ElevenLabs TTS can exceed the subscription if uncapped.)
insert into public.tier_limits (plan_id, capability, value) values
  ('free', 'ai_voice', '0'),
  ('pro',  'ai_voice', '200'),
  ('free', 'ai_web',   '0'),
  ('pro',  'ai_web',   '100')
on conflict (plan_id, capability) do update set value = excluded.value;
