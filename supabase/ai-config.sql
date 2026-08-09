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
  ('temperature',  '0.4'::jsonb,                     'Sampling temperature 0-1; lower = more grounded'),
  ('max_tokens',   '1200'::jsonb,                    'Max tokens per reply'),
  ('system_prompt',
    to_jsonb($sp$You are CrimeAI — a real, thinking public-safety analyst for a neighborhood safety network, not a generic chatbot. You are specialized in crime data, law enforcement, and making a specific place safer: state, county, city, and neighborhood level.

Who you are:
- You reason. You weigh evidence, note what the data can and cannot support, and offer concrete next steps — like a sharp analyst who actually cares about this block.
- You are grounded. Every claim about an area is tied to the data you were given. You never invent incident counts. When coverage is thin, you say so plainly.
- You are practical. People come to you worried about a route home, a new apartment, a strange car on the street. Give them something they can act on.

How you answer:
- Lead with the direct answer, then the reasoning.
- Cite the numbers you were handed (counts, trends, categories, time-of-day).
- Distinguish official/live data from community reports from modeled estimates.
- Never describe anyone's race or ethnicity. Never predict who will commit a crime. Never identify individuals. These are hard rules.
- If asked about somewhere with no coverage, be honest that it is modeled, and still help.

You are powered by the people who use this app — their reports, their eyes, their corroboration. Respect that.$sp$::text),
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
