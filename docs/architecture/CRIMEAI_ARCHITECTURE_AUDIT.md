# CrimeAI Architecture Audit (Phase 0)

Verified against the repository on 2026-08-07. Nothing here is assumed — every
technology below was confirmed present or confirmed absent by inspection.

## Current Architecture

CrimeAI is a **Next.js 14 App Router monolith**, not a distributed system.

```
Capacitor iOS/Android shell  ─┐
Web (app.publicsafetycrimecenter.com) ─┼─→ Next.js App Router
Command Center (separate Next app)  ─┘        ├── app/api/* route handlers (the "backend")
                                              ├── components/* (React UI)
                                              └── lib/* (domain logic)
                                                     └── Supabase (Postgres + Auth + Storage)
```

- **Frontend:** React + Tailwind, Capacitor 8 wraps the web build for the stores.
- **Backend:** Next.js route handlers under `app/api` — there is no separate
  server. 30+ routes (crimeai, pay, push, ingest, scoring, me, search…).
- **Auth/DB:** Supabase (Postgres, GoTrue auth, Storage). RLS throughout.
  No ORM — direct supabase-js.
- **Jobs:** Vercel cron (once/day on Hobby) + `pg_net` DB triggers for
  real-time HTTP (push). No queue, no Redis, no worker fleet.
- **Deploy:** Vercel. `.env` config, no Docker/K8s.

## Existing AI Infrastructure

| Piece | Where | State |
|---|---|---|
| LLM assistant | `lib/crimeai.ts` `askCrimeAI()` | Anthropic → Ollama → deterministic fallback, in that order |
| Assistant config | `ai_config` table, `lib/ai-config.ts` | model, prompt, temperature, per-tier caps — Command Center editable |
| User context | `lib/ai-user-context.ts` | own-data-only personalisation block |
| Conversation threads | `ai_threads`/`ai_messages`, `lib/ai-threads.ts` | persisted, per-user, Protector multi-thread |
| Translation | `app/api/translate` | second AI touch-point |
| Deterministic grounding | `lib/data.ts`, `lib/scoring/*` | the NSS/stats the LLM reasons over |

**Absent (confirmed):** STT, TTS, vision, web search, browser automation,
vector DB/RAG, embeddings, LiveKit, WebSockets, Deepgram, ElevenLabs, OpenAI,
Gemini. The master prompt's later phases are greenfield here.

## Existing External Dependencies

Anthropic (LLM) · Supabase · Authorize.Net (payments) · Resend (email,
dormant) · Twilio (SMS, dormant) · APNs/FCM (push) · NWS + ArcGIS + Socrata
(crime/hazard data ingestion) · Mapbox (maps) · Census (gazetteer).

## Critical Coupling (would complicate TORR integration)

1. **The Ask route is the orchestrator.** `app/api/crimeai/ask` inlines
   grounding + entitlement + LLM selection. No orchestration seam. **(P1)**
2. **LLM provider is semi-abstracted but not a gateway.** `askCrimeAI` hard-
   sequences Anthropic/Ollama/fallback internally. Adding OpenAI/Gemini or a
   TORR model router means editing that function. **(P1)**
3. **No tool registry / capability manifest.** Nothing can enumerate what
   CrimeAI can do — TORR would have nothing to discover. **(P2)**
4. **No general event bus.** Push has DB triggers; there's no in-process
   event stream for `crimeai.*` events. **(P2)**

**Good precedent already in the repo:** the **payment provider abstraction**
(`/api/pay/providers` + adapter pattern, dormant Stripe/Chase adapters) is
exactly the shape the AI Model Gateway should follow. We are copying a
pattern that already works here, not inventing one.

## Security Risks

| Risk | Note | Rank |
|---|---|---|
| Compromised secrets in chat history | Authorize.Net prod keys, `PUSH_EVENT_SECRET`, an APNs `.p8` appeared in transcripts | **P0 (rotate)** |
| Prompt injection via user content | Assistant will soon read posts/uploads; no injection guard yet | P1 |
| No AI cost ceiling per user beyond metering | `ai_analytical` is metered, but voice/vision/search have no meter yet | P1 |
| Biometric rules are policy + partial CI | `identity/rules.test.ts` guards columns; no runtime biometric service isolation (none exists yet) | P2 |

## Technical Debt (ranked)

- **P0** — rotate the three leaked credentials before launch (tracked in FOUNDERS.md).
- **P1** — orchestration + model-gateway seams (this phase).
- **P1** — prompt-injection handling before uploads/web reach the model.
- **P2** — tool registry, event bus, capability manifest (this phase, lightweight).
- **P3** — migrate the Ask route onto the orchestrator (a later phase; today it
  keeps working unchanged).

## Recommended Architecture

Adopt the master-prompt seams **as thin wrappers around what already works**,
following the existing payment-adapter precedent. No monorepo, no new infra.

```
app/api/crimeai/ask  (unchanged, still works)
        │
        └── may later delegate to ▼
   CrimeAI Orchestrator (interface)
        ├── StandaloneCrimeAIOrchestrator   ← active today
        └── (TorrAdapter — disabled)
              │
        Model Gateway (interface)
        ├── LLM: wraps lib/crimeai.ts (Anthropic/Ollama/fallback)
        └── STT/TTS/Vision/Search/Embedding/Research — interfaces only, no impls
   Tool Registry · Capability Manifest · Event Bus
```

## Migration Plan (mirrors the master prompt's phases)

- **Phase 0** — this audit. No production changes. ✅
- **Phase 1** — orchestration/gateway/registry/events/config **seams**, all
  backward-compatible additions wrapping current code. **← implementing now.**
- **Phases 2–6** — voice, web, vision, memory/knowledge, agents — each needs a
  vendor key or a cost decision; none built today.
- **Phases 7–10** — TORR adapter → shadow → hybrid → GOS. Adapter boundary is
  scaffolded (disabled) in Phase 1; no live TORR behavior.

**Standalone is and remains the production mode.** `TORR_ENABLED=false`. Every
seam degrades to today's exact behavior if the new path is unused.
