# Gamification Build — Phase 0: Full Codebase Audit

Date: 2026-08-05 · Baseline SHA: `4abf4d9` · Tests at baseline: **87/87 pass** (vitest, 15 files)
Read-only phase. **No code was written or changed.**

---

## 1. Stack & structure

- Next.js 14 App Router ×2: root app (app.publicsafetycrimecenter.com / pay. alias) + `command-center/` (portal.publicsafetycrimecenter.com). TypeScript, Tailwind, Capacitor 8 (iOS/Android shells).
- Supabase Postgres + Auth (email OTP + Google/Apple OAuth). No ORM — direct supabase-js; **migrations = raw SQL files in `supabase/` applied via psql** (no migration framework, not reversible-by-tool).
- Tests: Vitest (`lib/**/*.test.ts`), CI = GitHub Actions (typecheck + tests on every push, includes the safety-path guard).
- **Background jobs: Vercel cron only** — `/api/ingest/sync` daily (maxDuration 300s) and `/api/pay/authnet/reconcile` daily (60s). No queue, no workers, no pg_cron, no Edge Functions. Plus Postgres triggers (counter bumps, plan projection). **Scoring recomputation must fit: cron routes ≤300s + DB functions/triggers + compute-on-read.**
- Caching: in-process module caches only (tier config 60s, kill-switch 30s, several unbounded); `serverDb` forces `cache:"no-store"` (Next fetch-cache bug fixed previously). No Redis.
- Auth resolution server-side: Bearer JWT → `resolveUserId()` (`lib/entitlements/request.ts:13`).

## 2. Monetization (build-plan Phases 0–3): ALREADY BUILT by prior sessions

Complete and sandbox-verified (see `PHASE5-VERIFICATION.md`): tier schema (`tier_plans/prices/limits/subscriptions`, usage counters, grace), `EntitlementService.can/consume` + typed capabilities, Authorize.Net checkout (signed cross-domain token, Accept.js, CIM→ARB), signed idempotent webhooks, reconciliation cron, dunning/grace, kill switch (`enforcement_flags`, currently OFF), enforcement wired (AI metered always-on; map history/address search/score depth/saved places/circle/channels dormant behind switch), Protector badge = DB projection of `tier_subscriptions` with user show/hide pref, Command Center Finance admin + analytics. Resend payment emails live.

Honest deltas vs the build-plan checklists: **Apple/Google Pay not built** · **US-storefront runtime check not built** · locked-features-visible UI only partial (channels labeled "Protector"; map-history clamp is silent) · **dynamic free alert radius (1→3mi activity-based) not implemented** (`alert_radius` capability exists, unwired) · SMS digest/immediate alerts not built (no Twilio account; dormant adapter only) · trials/proration/card-update flows not built (single plan, no trials yet).

## 3. Existing Safety Score — exact current state

**One formula, one place** — `lib/data.ts:216-225` inside `computeStats`:
```
area = π·r²  (r = radiusMiles, default 1)
exposure = Σ incident.severity / area          ← no decay, no source weight, no per-capita
safetyScore = clamp(2..98, round(100 − exposure × 1.15))
cityComparisonPct = (exposure − mean of 24 Miami neighborhood exposures) / mean
```
- **Never stored** — computed per request in `/api/crimeai/lookup` + `/api/crimeai/ask` only. No recompute jobs.
- Incident pool (mutually exclusive, `lib/data.ts:147-149`): live DB ingest (≥3 rows) → Miami seed JSON (718 rows) → deterministic synthetic model. Severity sources: seed literals; synth table (`lib/data.ts:44-63`); ingest keyword rules (`lib/ingest/normalize.ts:6-15`); category defaults for community reports (`lib/categories.ts:15-24`).
- `incident.confidence`, `verified`, `corroborating_sources` exist on the type but are **display-only — never used arithmetically**. `corroborating_sources` is always `[]` (dead display path — natural hook for corroboration).
- Renders: `SafetyScore.tsx` ring card (My Score tab), AskScreen chip, LLM context. Band thresholds 75/55/40 duplicated in `SafetyScore.tsx:7-8` and `AskScreen.tsx:165`.
- **Direct answer required by the prompt: is the current score influenced by engagement or payment? NO.** Community reports never reach `computeStats` (they only merge into map pins client-side, `MapScreen.tsx:69-78`). No entitlement import in the compute path. The only plan-dependent input is the `days` window clamp (7 free / 90 pro when enforcement is on) — same formula, shorter window. `trimStatsForDepth` trims companion display metrics only; the score value always survives (locked by test `request.test.ts:46`).

## 4. Profile safety tabs (MUST NOT CHANGE — Billy directive)

`components/screens/MeScreen.tsx` — Posts | My Safety (`:111-114`); sub-tabs at `:132`: **"My Score"** (renders `<SafetyScore stats>` `:149`), **"My Reports"** (`myPosts` filtered `kind==="report"` → `FeedList` `:156`), **"My Neighborhood"** (`CategoryBreakdown` + `TimeOfDay` + static `CoverageMatrix` `:164-166`). All fed by the single `AppShell` stats fetch. **Additive slots exist inside each tab body; the tab array/union at `:47`/`:132` needs no change.**

## 5. Reporting flow / feed / reputation / anti-abuse — what exists

- **Reports** = `posts` rows with `kind='report'` via `ComposeSheet` (category chip only; **location = home ± jitter, not GPS**; `verified:false`; no severity column — derived from category at read). Moderation = manual flags → Command Center review. **No corroboration/confirm mechanic, no dedupe, no report rate limit.**
- **Feed** = one 200-row `created_at desc` query + client-side tabs. `rankForYou` (`lib/social.ts:59-75`): recency/own/following/proximity/interests/media/engagement/live. **No reputation, severity, or trust terms; report posts rank like selfies.** Alerts surface = InboxScreen (pull-based, timestamp sort + severityMin/category filter). `priority_visibility` capability exists, **unwired anywhere**.
- **Reputation systems: none.** Only: per-post admin-granted `verified` check, Live Ambassador flag, Protector badge (billing projection), on-the-fly engagement pill on profiles. No points/karma/streaks/levels/leaderboards.
- **Anti-abuse: effectively none.** Ban system (blocks posting only — banned users can still like/comment/message), reserved-handle list, per-user personal blocks. **No rate limiting, velocity checks, phone verification, VOIP detection, device attestation, or IP checks anywhere.** Reusable primitive: atomic `consume_usage()` counter.
- **Notifications: none.** No push infra, no device tokens; `alert_channels` preference is stored but nothing delivers. SMS adapter dormant (no Twilio). In-app Inbox is the only channel.
- **Geo/census:** haversine + 0.02° grid cells exist; **no geohash lib, no neighborhood polygons (24 centroids only), no ZIP boundaries (21 hardcoded Miami ZIPs), no census/population data anywhere.**

## 6. Command Center — confirmed

`command-center/` = the internal admin dashboard at portal.publicsafetycrimecenter.com (owner/admin/finance/moderator/analyst roles, `admins` table, audit log). This is the surface build-plan Phase 11 extends. (Confirmed with Billy in prior sessions.)

## 7. Safety-critical paths (Rule 1 inventory)

All client-only in `components/SOS.tsx`: SosFab `:15-86`, SosPill `:89-95`, SosSheets `:98-123`, NotSafe + circle notify `:142-167`, `tel:911` `:119,159`, WalkWithMe `:170-201`. No server dispatch backends exist yet. CI guard: `lib/entitlements/safety-paths.test.ts` (SAFETY_FILES = SOS.tsx; **every future dispatch backend must be added**). Zero score/tier/entitlement refs confirmed at baseline.

## 8. Adjusted implementation plan (one phase per session)

| Session | Plan phase | Work | Notes vs plan |
|---|---|---|---|
| done | 0–3 | audit, entitlements, payments, enforcement | already shipped + verified |
| next | 4 | Scoring foundation: `lib/scoring/` (NSS/Guardian/Block modules, strict boundaries), score tables + history + explanations, config tables + validating loader, cron recompute route, **new NSS in parallel — old `computeStats` untouched**, divergence report | geohash = small in-repo util (no new dep); recompute = incremental per-area within 300s cron |
| +1 | 5 | Full NSS: severity weights/half-lives/kernel/source credibility from config, per-capita (needs census import — see gaps), metro percentile, confidence + range display, **30%/5% caps + adversarial fixtures**, methodology doc from config, module-boundary CI test | percentile initially over sampled metro cells |
| +2 | 6 | Identity trust L0–L2 + anti-abuse (velocity, entropy, report-ring graph), IDV vendor options presented → **Billy chooses** before L3/L4 | L1 phone verify needs Twilio (Billy) |
| +3 | 7+8 | Guardian Score + Watch Points (append-only ledger, vesting, caps, zero-points suspicious-person) + Protector flip into existing `tier_subscriptions` (comped-months pattern exists) | |
| +4 | 9+10 | Block Strength (crime-rate-not-input test) + two-feed split (alerts ranker: no engagement signals) + severity-capped priority visibility; badge phase mostly done already | feed split touches FeedScreen/Inbox — prime-directive care |
| +5 | 11 | Command Center: extend Finance/new Scores section with all metric groups | reuse Spark/StatCard |
| +6 | 12 | Full verification, before/after, raw output | |

## 9. Assumptions & what I need from Billy

1. **Serverless-only recompute** (cron + triggers + on-read) is acceptable — no new infra.
2. **Census data**: I'll import a small static ACS population-per-tract/ZIP dataset for Miami-Dade as a repo/data table (needed for per-capita NSS). Approve adding that data file.
3. **User-report location**: reports currently pin to home±jitter. For user reports to ever contribute to NSS (capped), report-time location capture is a product change — approve or NSS runs on official/ingest sources only at first (my default: official-only until you approve capture).
4. **L1 phone verification** requires Twilio (account = you) + a lookup API for VOIP detection. Until then L1 is email-only weight.
5. **Device attestation** (L2) needs native builds wired to Play Integrity/App Attest — flagged as native work, not in early sessions.
6. Notifications for score/points events ship via in-app Inbox only (no push infra exists).
7. IDV vendor (L3/L4): options will be presented in Phase 6; **no integration until you choose**.

## 10. Ranked risks

1. **Safety paths** — scoring must never touch `SOS.tsx`; guard extends as any dispatch backend appears. (Structural risk low; consequence extreme.)
2. **NSS integrity** — module boundary test from day one; new NSS runs parallel to old score until your explicit cutover sign-off.
3. **Serverless ceiling** — metro-wide recompute must be incremental/sharded under 300s; design requirement, not afterthought.
4. **Data gaps** — no census/polygons/geohash today; NSS confidence will honestly be LOW-range display for thin areas.
5. **Feed split** — touching FeedScreen/InboxScreen risks regressions in the app's core surface; additive tabs, no removals.
6. **Profile column landmines** — `profileToRow` clobbers unlisted columns; `getProfileDirectory` cache never invalidates (badges would stale). New columns must be excluded from the mapper and the directory gets an invalidation hook.
7. **Sparse real data** — divergence report old-vs-new NSS will largely reflect seed/synth data in this environment; stated honestly when produced.

## 11. Pre-existing issues noticed (report-only, per prime directive — nothing touched)

- **SECURITY: Apple auth key `AuthKey_5YH697B4BL.p8` is committed at the repo root** — should be removed from the repo + rotated (Billy).
- Plaintext admin + persona passwords committed (`supabase/admin.sql:160-162`, `personas.sql:27`) — already flagged; rotate before launch.
- `/api/ingest/sync` is unauthenticated unless `SYNC_KEY`/`CRON_SECRET` set, with wildcard CORS.
- Banned users can still like/comment/message (only posting is blocked).
- `posts.shares` is a dead counter yet weighted in `trendingScore`; `corroborating_sources` always empty; `meanNeighborhoodExposure` comment says median, code computes mean; band thresholds duplicated in two components; no DB index on `posts(kind)`/`posts(user_id,kind)` (needed for per-author scoring queries).

## 12. Unbuildable as written (until inputs exist)

- NSS per-capita normalization → needs the census import (item 9.2).
- Non-VOIP phone verification → needs Twilio + lookup vendor (9.4).
- Device attestation → native build work (9.5).
- L3/L4 → vendor choice pending (9.7).
- SMS/push delivery of any gamification event → no delivery infra.

## 13. What I removed or changed that already existed

**Nothing.** This phase wrote no code. The only repo change is this audit document.

---

## PRE-FLIGHT checklist

- [x] Entire repository read, every top-level directory accounted for — two exhaustive sweeps + prior sessions' full coverage (evidence: §1–§7 file:line citations)
- [x] Baseline git commit SHA recorded — `4abf4d9`
- [x] Existing test suite run, raw output — `Test Files 15 passed (15) · Tests 87 passed (87)` (vitest v4.1.10, 2026-08-05)
- [x] Migration tooling identified — raw SQL via psql (proven across 8 applied migrations this project)
- [x] Background job infra identified — Vercel cron only; constraint flagged (§1, §8)
- [x] Auth provider + server-side user resolution — Supabase; `lib/entitlements/request.ts:13`
- [x] Safety-critical paths listed by file path — §7
- [x] Command Center surface confirmed with Billy — portal admin app (§6, confirmed prior sessions)
- [x] Assumptions listed — §9
- [x] Risks ranked, safety-path risks called out — §10
- [x] Not-buildable-as-written items listed — §12
- [x] Prime-directive conflicts — none; §13

**STOP. Awaiting approval to begin Phase 4 (scoring foundation).**
