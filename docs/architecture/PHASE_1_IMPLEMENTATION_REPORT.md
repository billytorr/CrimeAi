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
