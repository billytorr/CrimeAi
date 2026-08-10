# Phase 1 Implementation Report

Non-destructive architecture seams around CrimeAI's existing AI, per the
master prompt §40 Phase 1 and §48 operating procedure. Standalone remains the
production mode; TORR stays disabled with no fake behaviour.

## Files Added

| File | Purpose |
|---|---|
| `lib/ai/config.ts` | orchestration mode + provider selection from env (safe defaults) |
| `lib/ai/providers.ts` | provider **interfaces** — LLM/STT/TTS/Vision/Search/Research/Embedding (only LLM implemented) |
| `lib/ai/gateway.ts` | Model Gateway — LLM wraps existing `lib/crimeai.ts`; others are honest unconfigured stubs |
| `lib/ai/tools.ts` | Tool Registry — only real tools available; voice/vision/web declared `available:false` |
| `lib/ai/events.ts` | in-process event bus (no Kafka), never throws into the emitter |
| `lib/ai/capabilities.ts` | capability manifest **generated from actual implementation** |
| `lib/ai/orchestrator.ts` | `CrimeAIOrchestrator` interface + `StandaloneCrimeAIOrchestrator` |
| `lib/ai/torr/adapter.ts` | TORR boundary — disabled, no client, returns null |
| `app/api/crimeai/health/route.ts` | `/health` — standalone health, no secrets |
| `app/api/crimeai/capabilities/route.ts` | `/capabilities` — the manifest |
| `lib/ai/architecture.test.ts` | 15 tests pinning standalone behaviour + the TORR-disabled contract |
| `docs/architecture/CRIMEAI_ARCHITECTURE_AUDIT.md` | Phase 0 audit |

## Files Modified

| File | Change |
|---|---|
| `app/api/crimeai/ask/route.ts` | LLM call now goes through `orchestrator().ask()` instead of `askCrimeAI()` directly |
| `.env.example` | added the optional orchestration/provider/TORR/TCL knobs |

## Before / After

**BEFORE** — the Ask route called `askCrimeAI()` directly. LLM provider
selection (Anthropic → Ollama → fallback) was hard-sequenced inside
`crimeai.ts`. Nothing could enumerate capabilities; no orchestration seam; no
TORR boundary.

**AFTER** — the route calls `orchestrator().ask()`, which routes through the
Model Gateway to the **same** `askCrimeAI()`. Identical answer, plus events
fire and the implementation behind the seam can be swapped (hybrid/torr) later
without touching the route. `/health` and `/capabilities` expose the system to
CrimeAI Admin and a future TORR Mission Control.

## Architecture Changes

Added the seams from §50 as thin wrappers, following the repo's existing
payment-adapter precedent:

```
app/api/crimeai/ask  →  orchestrator()  →  gateway.llm()  →  askCrimeAI()  (unchanged)
                              │
                        StandaloneCrimeAIOrchestrator (only impl)
                        /health  /capabilities   TORR adapter (disabled)
```

## Compatibility

- `lib/crimeai.ts` is **untouched**; the gateway wraps it. Anything importing
  `askCrimeAI` directly still works.
- The Ask route returns the same `{ answer, engine, ai, location, stats }`
  shape. The threaded UI, entitlement metering and fallback path are unchanged.
- All new env vars are optional; unset = today's exact behaviour.

## Tests

- `lib/ai/architecture.test.ts` — 15 tests. The §38 priority test ("TORR
  disabled, critical paths work") is covered: standalone is the default, TORR
  never arms in standalone mode, stubs reject rather than fabricate, manifest
  is generated from real tools, health reports TORR unreachable.
- Full suite: **413 passing**, 1 skipped. Typecheck clean (both apps). Mobile
  bundle builds.

## Known Issues

- Prompt-injection handling is not yet added (P1) — must land before uploads
  or web search reach the model in a later phase.
- The orchestrator is adopted only on the Ask route's LLM call. `translate`
  and other AI touch-points still call providers directly; migrating them is a
  later, low-risk task.

## Security Notes

- No secrets in `/health` or `/capabilities` — they report booleans and names,
  never keys or endpoints.
- TORR adapter has no client and returns null; there is no code path that
  reaches an external orchestrator. §43 emergency-standalone is the *only*
  state.
- The three leaked credentials (Authorize.Net, `PUSH_EVENT_SECRET`, APNs `.p8`)
  remain **P0 to rotate** — unchanged by this phase, tracked in FOUNDERS.md.

## Next Phase

Per the master prompt, later phases are gated on explicit instruction and each
needs a vendor key or a cost decision: voice (Deepgram/ElevenLabs), web
(Brave/Tavily/Playwright), vision, memory/knowledge, agent standardisation,
then the TORR adapter → shadow → hybrid progression. None built here.

## TORR Readiness

The boundary exists and is disabled. When a real TORR endpoint arrives: a
`TorrClient` is implemented in `lib/ai/torr/adapter.ts`, the orchestrator's
mode selection returns a hybrid/torr implementation, and TORR first runs in
**shadow** (§41). No rewrite of CrimeAI internals is required — which was the
success condition (§50).

---

# Phase 4 addendum — Vision (real, testable)

Built because Anthropic (already our key) is vision-capable — no new vendor,
so this is a REAL provider, not a dormant scaffold.

## Added
- `lib/ai/vision/anthropic-vision.ts` — real vision provider. Domain-scoped
  system prompt with the same hard rules as the text assistant (no identifying
  individuals, no race/ethnicity, no guilt/prediction from an image).
- `app/api/crimeai/vision/route.ts` — metered `ai_vision`, Protector-only,
  free tier declined with an upsell (402), fails closed on infra error.
- `ai_vision` capability + `supabase/ai-vision-limits.sql` (free 0, pro 100).
- Image upload in AskScreen (Protector only) — compresses, sends, renders.
- Gateway `vision()` returns the real provider when configured; the tool and
  manifest flip `vision.analyze` / `image_analysis` on accordingly.

## Voice (Phase 2) + Web (Phase 3)
NOT built as live providers — no Deepgram/ElevenLabs/Brave/Tavily credentials,
and the prompt forbids fake behaviour. They remain honest unconfigured stubs
in the gateway (`configured:false`, reject on call) and `available:false`
tools. Building them is a config-flip + provider file once keys exist, exactly
like vision was.

## Cost tracking (§25)
Vision reuses the existing metered-capability system (`enforceConsume`), so
image analysis draws from a per-user monthly cap the same way `ai_analytical`
does — the cost ceiling the prompt requires before a paid AI feature ships.

416 tests pass (17 architecture + vision). Guards green: safety-paths (11),
scoring boundary. Typecheck clean both apps, mobile bundle builds.

---

# Phases 2 + 3 — Voice + Web (real providers, keys now in Vercel)

## Voice (Phase 2)
- `lib/ai/voice/deepgram-stt.ts` — Deepgram speech-to-text
- `lib/ai/voice/elevenlabs-tts.ts` — ElevenLabs text-to-speech (needs key AND voice id)
- Routes: `/api/crimeai/voice/transcribe` (metered ai_voice, Protector), `/voice/speak` (Protector-gated, not double-metered)
- UI: mic button records → transcribes → sends; a "Play" speaker on assistant replies

## Web (Phase 3)
- `lib/ai/web/brave-search.ts` — Brave search
- `lib/ai/web/tavily-research.ts` — Tavily research (its own summarised answer + sources)
- Route: `/api/crimeai/web` (metered ai_web, Protector; search=Brave, research=Tavily)
- UI: globe toggle in the composer → a query runs Tavily research, shown with sources

## Deliberate safety boundary
Web content is surfaced via **Tavily's own summary**, NOT injected into
CrimeAI's model context. The Phase 0 audit flagged prompt injection as an
unhandled P1; feeding raw web pages to the LLM is where that bites. Autonomous
"CrimeAI reads the open web" is deferred until the injection guard exists.

## Cost caps
`ai_voice` (200) and `ai_web` (100) are Protector-only metered capabilities
(`ai-voice-web-limits.sql`), fail-closed like every cost path. ⚠️ ElevenLabs
minutes can exceed the subscription if uncapped — tune these in Command Center
against real pricing before scale, and consider Deepgram TTS as the cheaper
alternative.

Providers unit-tested with mocked fetch (request shaping, response parsing,
dormant-without-key). 425 tests pass, safety guards green, both apps
typecheck, mobile bundle builds.

---

# Phase 5 — Memory (no vendor)

Durable per-user memory (§16 User Memory) — CrimeAI remembers facts across
conversations, the ChatGPT-memory behaviour, built on the threads already
shipped.

- `supabase/ai-memory.sql` — `crimeai_user_memory`, own-row RLS, 50-fact cap
  (rolling window), dedupe. No biometric/ID/payment/address — refused by both
  the blocklist and convention.
- `lib/ai/memory/user-memory.ts` — get/save/forget, `isStorableFact` blocklist,
  `memoryContext` recall block, `extractMemory` tag parser.
- Recall: folded into `buildUserContext`, so every answer is informed by what
  CrimeAI remembers.
- Capture: the ask route appends a memory instruction; the model may emit one
  `<remember>…</remember>` tag, parsed and saved server-side, stripped from the
  reply. **Zero extra API calls** — no added cost, no injection surface.
- Control: Settings → "What CrimeAI remembers" lists every fact with one-tap
  Forget. Transparency + deletion is a privacy requirement, not a nicety.
- `/api/me/memory` GET/POST/DELETE.

The other §16 classes map to existing pieces: Conversation Memory = ai_threads,
live User data = ai-user-context. Visual/Case/Agent memory are later phases.

432 tests pass (memory extraction + blocklist unit-tested). Guards green.
