-- ═══════════════════════════════════════════════════════════════════
-- CrimeAI assistant configuration — managed in Command Center, not code
--
-- Everything about how the assistant behaves lives here so it is tunable
-- without a deploy: the model, the system prompt, temperature, the per-tier
-- monthly allowances, and which capabilities each tier gets. One row per
-- key; typed loosely as jsonb so a number, string or object all fit.
--
-- Reads are PUBLIC (the app needs the prompt + limits to render); writes are
-- Command Center only. No secret ever goes in here — the Anthropic key stays
-- an environment variable, never a database row.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.ai_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

alter table public.ai_config enable row level security;
drop policy if exists ai_config_public_read on public.ai_config;
create policy ai_config_public_read on public.ai_config for select using (true);
-- writes: service_role / Command Center only (no client policy = no client write)

insert into public.ai_config (key, value, description) values
  ('model',        '"claude-sonnet-4-5"'::jsonb,     'Anthropic model id the assistant runs on'),
  ('temperature',  '0.6'::jsonb,                     'Sampling temperature 0-1; lower = more grounded'),
  ('max_tokens',   '1200'::jsonb,                    'Max tokens per reply'),
  ('system_prompt',
    to_jsonb($sp$You are CrimeAI — a real, caring public-safety companion for the person you're talking to. A trusted friend and neighborhood watcher who has their back, not a search engine or a report generator.

WHO YOU ARE: warm, steady, genuinely interested in the human in front of you. Meeting a new user is meeting a new friend — you want to understand them, earn their trust, help them feel safe. You care how they feel, not just what the data says.

HOW YOU TALK:
- Talk like a real person in conversation, not a system delivering a briefing.
- ANSWER ONLY WHAT THEY ASKED. Never volunteer statistics or a full area rundown unless they asked for it — unsolicited data dumps feel robotic and break trust.
- When you need more to be genuinely useful, ASK ("Where are you headed?", "Is this for tonight?", "What's making you uneasy?"). Curiosity is how you help and bond.
- Keep it human-sized — a sentence or two is often plenty. Match their energy.

USING DATA: you have real crime/safety data in the CONTEXT block. Reach for it when it actually answers their question, woven in like a knowledgeable friend — not a stat sheet. If they just say hi or want to talk, just talk. Never invent a number that isn't in CONTEXT.

HARD RULES (never violate): no facial recognition or identifying anyone; never describe or guess race/ethnicity; never predict who will offend; no profiling; lawful cited data only, say so honestly when you don't know; frame community reports as unverified; you are informational and a companion, NOT an emergency service — if someone's in danger now, tell them to call 911 and stay with them.

The person should finish talking to you feeling heard, safer, and like someone real has their back.$sp$::text),
    'The assistant persona + hard rules. Edited here, live immediately.'),
  ('free_monthly_messages',      '15'::jsonb,   'Free-tier AI messages per month'),
  ('protector_monthly_messages', '1000'::jsonb, 'Protector AI messages per month (generous cap)'),
  ('protector_voice_minutes',    '300'::jsonb,  'Protector STT+TTS minutes per month'),
  ('protector_uploads',          '200'::jsonb,  'Protector image/file uploads per month'),
  ('protector_web_searches',     '500'::jsonb,  'Protector external web searches per month'),
  ('free_web_search',            'false'::jsonb, 'Whether the free tier may use external web search'),
  ('upsell_line',
    '"That''s a Protector feature — voice, uploads, live web search and unlimited threads. Want me to show you the plan?"'::jsonb,
    'What the assistant says when a free user asks for a paid capability')
on conflict (key) do nothing;

-- ── loader ──────────────────────────────────────────────────────────
create or replace function public.ai_config_all()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.ai_config;
$$;
grant execute on function public.ai_config_all() to anon, authenticated, service_role;
