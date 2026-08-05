# Phase 5 — Tier System Verification Report

Date: 2026-08-05 · Build verified: `cc541e7` · Environment: **Authorize.Net SANDBOX** (`AUTHNET_ENV=sandbox`)

Everything marked **VERIFIED** was re-run fresh against the deployed system during this audit — not inherited from earlier sessions. Everything not provable is listed under **NOT PROVEN**, per the honesty requirement.

## Automated checks (fresh run)

| Check | Result |
|---|---|
| Root app typecheck (`tsc --noEmit`) | clean |
| Unit tests (`vitest run`) | **87/87 pass**, 15 files |
| Safety-path CI guard (Rule 1) | pass; `grep -ciE 'entitlement\|tier_\|subscription\|consume_usage' components/SOS.tsx` → **0** |
| Command Center typecheck + `next build` | clean |
| CI on every push (`.github/workflows/ci.yml`) | typecheck + tests, incl. the safety guard |

## Live end-to-end lifecycle (deployed sandbox, browser-driven, test card 4111…)

| Step | Evidence |
|---|---|
| Signed cross-domain checkout ($7.99 from live config) | page rendered "Subscribe — $7.99/mo" |
| Accept.js tokenization → Customer Profile → ARB | subscription **9883494**, status `active`, `pro_799`, Visa ····1111, receipt_email stored |
| Badge projection (Phase 3) | `profiles.plan` → **pro** immediately after checkout |
| **Real signed** `cancelled` webhook over the wire | 200 processed → status `canceled` → badge **free** |
| ARB gateway cancel (teardown) | `ok:true` |
| Anonymous AI ask (cost gate) | `engine: fallback` — zero LLM spend |
| Reconcile without secret | 401 |

## Previously proven against live infrastructure (this project, evidence in git history)

- **Atomicity (Rule 5):** 30 parallel `consume_usage` at limit 5 → exactly 5 allowed; 15 parallel `redeem_nonce` → exactly 1; 10 parallel `add_saved_location` at limit 5 → exactly 5.
- **Webhooks:** signature verify (tampered → 401), idempotent dedupe (duplicate `notificationId` → no double-apply), suspended → `past_due` + 7-day grace, terminated → `canceled`; **real** Authorize.Net webhook received/processed in ~10s (notification `2df9c4d4-…`).
- **Reconciliation:** expired-grace `past_due` swept → `canceled` (`grace_swept:1`); ARB-status drift correction path in place; daily Vercel cron configured.
- **Kill switch:** OFF → 90-day map query returned 84 incidents; ON → same query returned 17 (the free 7-day window); anonymous feature-search 401; onboarding/bootstrap lookup unaffected; OFF again → 84. Cost paths enforced regardless of switch.
- **DB clamp trigger:** free profile saved with 5 contacts + all channels → clamped to 3 contacts, push-only when ON; untouched when OFF.
- **Emails:** live Resend send verified (welcome email delivered to team@creativewolf.com, message id returned). Payment-failed/receipt/canceled use the same adapter+path.
- **Config freshness:** price change ($4.99→$7.99) propagated to live checkout with **no deploy** (after fixing the Next.js fetch-cache bug in `serverdb.ts`).

## Non-negotiable rules audit

1. **Safety ungated** — all safety features are client-only in `components/SOS.tsx`; zero entitlement refs; CI-enforced. Future server dispatch backends must be added to `SAFETY_FILES` in `lib/entitlements/safety-paths.test.ts`. ✅
2. **Server-side authority** — every gate lives in API routes / SQL functions / DB triggers; the client reads `/api/me/entitlements` for rendering only. ✅
3. **Fail open; cost paths fail closed** — infra errors grant access (logged loudly) except `ai_analytical`/`sms_immediate`, which fail closed to free behavior (grounded fallback answer / no send) — never to nothing, never unbounded. Unit-tested. ✅
4. **No hardcoded config** — prices/limits/plan names live in `tier_plans/tier_prices/tier_limits`, editable in the Command Center without deploy; multiple concurrent active prices supported (deterministic per-user arm, honored for subscription life). ✅
5. **Race-safe counters** — atomic SQL (`consume_usage`, `redeem_nonce`, `add_saved_location`), proven with parallel calls; periods anchor to billing period (paid) / account creation UTC (free). ✅
6. **Web-only Authorize.Net checkout** — `pay.publicsafetycrimecenter.com/crimeai/pricing/checkout`, signed token handoff, fee hook returns 0 (`lib/entitlements/fees.ts`). Wallets not built (see NOT PROVEN). ✅
7. **Grace before revoke** — failed payment → `past_due` + `grace_until` (default 7d, `TIER_GRACE_DAYS`); access + badge kept through grace; revoked only after (reconcile sweep). ✅
8. **Card data never on our servers** — Accept.js tokenizes in-browser; server sees only the opaque nonce + masked last4. SAQ A posture. ✅
9. **Gateway never on the read path** — entitlement reads hit only our DB; Authorize.Net is an event source (webhooks) + reconciliation target. ✅

## NOT PROVEN (honest gaps — most need production or Billy's hands)

1. **Production (`liveMode`) behavior** — everything above is sandbox. Specifically unproven: the CIM→ARB propagation lag under production `liveMode` (sandbox lag is variable, up to ~100s; the checkout now retries ~20s and, on failure, un-redeems the nonce so the customer can simply retry — but if production lags like the sandbox, build async activation before launch). **Close at the production smoke test: one real card.**
2. **A real recurring charge + receipt email** — ARB's first charge runs in the nightly settlement batch; the `authcapture` webhook → receipt path is unit-tested and the handler processed synthetic events, but no real batch charge has flowed yet. Check the sandbox after a batch night.
3. **Dunning with a real failing card** — suspended-webhook path proven with signed synthetic + real cancelled events; an organic card-decline→suspension sequence hasn't occurred.
4. **Command Center logged-in UI** — build + queries verified; the dashboard render is behind Billy's admin login (visual confirmation is his).
5. **Apple Pay / Google Pay** — not built (needs Apple/Google merchant + domain verification).
6. **SMS** — dormant adapter only; no Twilio account, no real send.
7. **Client-side visual gating at scale** — enforcement was flipped ON only briefly for verification; no real free-user population has lived under it yet.

## Go-live checklist (production cutover)

1. **Rotate the production Authorize.Net keys** (the ones pasted in chat are compromised) — API Login ID stays, generate new Transaction Key + Signature Key + Client Key.
2. In Vercel set: `AUTHNET_ENV=production`, the new `AUTHNET_TRANSACTION_KEY`/`AUTHNET_SIGNATURE_KEY`/`NEXT_PUBLIC_AUTHNET_CLIENT_KEY` (login ID unchanged), confirm `CRON_SECRET` set; redeploy.
3. **Production webhook** (already registered per Billy) — confirm its Signature Key equals the *new* rotated key.
4. **Production smoke test:** one real-card checkout ($7.99) → verify subscription + DB row + badge + welcome email → **verify the first-time flow has no E00040 lag under liveMode** → cancel + refund via dashboard if desired.
5. Command Center: flip **enforcement ON** when ready (limits go live in ≤30s; break-glass OFF anytime).
6. Change the Command Center owner password (seeded value is in the repo).
7. Optional hardening: delete `app/api/pay/authnet/selftest/` (also auto-inert in production), migrate Supabase auth-email sender fully onto the same Resend account (done per Billy), set `TIER_GRACE_DAYS` if a non-7-day grace is wanted.
