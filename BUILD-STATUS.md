# CrimeAI Build Status — Per-Phase Checklist

Updated: 2026-08-05 · HEAD `5aa93d7` · Tests **126/126** (+1 env-gated tool) · Sandbox environment
Legend: ✅ working & verified · 🟡 built, dormant/waiting on a switch or account · ⬜ not built

---

## BUILD 1 — Tier & Payment System (all phases COMPLETE, sandbox-verified)

### Phase 1 — Entitlement data model ✅
- ✅ Tier schema: plans / prices (multi-active A/B) / limits / subscriptions / usage counters / grace — live in DB
- ✅ `EntitlementService.can()/consume()` — single surface, typed capabilities
- ✅ Atomic counters (proven: 30 parallel consumes at limit 5 → exactly 5)
- ✅ Config DB-driven, validated, changeable without deploy (Next fetch-cache bug found & fixed)
- ✅ Fee hook returning 0 (ready for future platform fees)

### Phase 1B — Authorize.Net payments ✅
- ✅ Signed cross-domain checkout token (single-use nonce, replay-proven 15-parallel→1)
- ✅ Accept.js checkout at pay.publicsafetycrimecenter.com — card never touches our servers
- ✅ CIM Customer Profile → ARB subscription (proven: multiple live sandbox subs, e.g. 9883494)
- ✅ Webhooks: signature-verified, idempotent, real Authorize.Net events processed (~10s)
- ✅ Reconciliation daily cron + grace sweep · dunning 7-day grace
- ✅ Payment emails via Resend (welcome delivered to Billy) — receipts@publicsafetycrimecenter.com
- ✅ Checkout survives gateway hiccups (retry + un-burned nonce — found in Phase 5 audit)
- 🟡 Apple Pay / Google Pay — not built (needs Billy's merchant verification)
- 🟡 Production cutover — pending: rotate keys, env flip, one real-card smoke test

### Phase 2 — Tier enforcement ✅ (dormant by design)
- ✅ Server gates wired: AI metering, map history clamp, address search, score depth, saved places, circle size, channels (DB trigger)
- ✅ **AI cost metering LIVE always** (kill switch can't open LLM spend); anonymous → free fallback
- 🟡 **Kill switch OFF** → free users currently see no limits; flip in Command Center → Finance when ready
- ✅ Safety paths: zero entitlement refs, CI-enforced
- ⬜ Dynamic free radius (1→3mi), storefront check, SMS digest — deferred gaps

### Phase 3 — Protector badge ✅
- ✅ Badge = live entitlement projection (checkout→on, webhook cancel→off, grace keeps it — all proven)
- ✅ Billy's red-shield artwork, profile pages only, sized beside name
- ✅ Owner show/hide toggle (respected for visitors too)

### Phase 4 — Command Center ✅
- ✅ Finance: kill switch, price edit/activate/**create**, 12-capability limits editor, member list, comp grant/revoke, billing events
- ✅ Analytics: subs trend, conversion, churn, arm split, metered usage + top AI consumers (spend watch)
- 🟡 Visual confirmation of logged-in dashboard = Billy's (login-gated)

### Phase 5 — Verification ✅
- ✅ Full audit in `PHASE5-VERIFICATION.md`: fresh end-to-end lifecycle, rules 1–9 matrix, NOT-PROVEN list, go-live checklist
- Found & fixed 2 real bugs during audit (E00040 retry budget, burned nonce)

---

## BUILD 2 — Gamification & Scoring (Phase 0 + 4 done; 5–12 remaining)

### Phase 0 — Full codebase audit ✅
- ✅ Read-only audit committed: `GAMIFICATION-PHASE0-AUDIT.md`
- ✅ Direct answer: legacy Safety Score NOT influenced by engagement/payment
- ✅ Billy's tabs (My Score / My Reports / My Neighborhood) mapped — unchanged, additive slots identified
- ✅ Security finds reported: committed Apple .p8 key, plaintext admin passwords (Billy to rotate)

### Phase 4 — Scoring foundation ✅ (merged 2026-08-05)
**What's new:**
- ✅ `scoring_config` in DB — every spec constant (severity weights, half-lives, σ, source credibility, 30%/5% caps) — editable without deploy
- ✅ Pure NSS engine: decay, Gaussian kernel, source weights (unverified user reports = 0), anti-manipulation caps, confidence, **range display when uncertain**, full explanation on every score
- ✅ `area_scores` + append-only history — **LIVE: 24/24 neighborhoods scored & persisted, 0 errors, all with complete explanations**
- ✅ Recompute: daily cron + event-trigger after ingest sync (**proven live on deploy**)
- ✅ Rule 2 CI test: NSS module structurally cannot import entitlement/subscription/gamification/engagement code
- ✅ Safety-path guard extended with scoring terms (Rule 1)
- ✅ Divergence report old-vs-new: mean |Δ| 16.3, max 47 — new NSS harsher on violent-crime areas (correct per spec weights)

**What changed that already existed (all additive):** ingest sync route (+fail-soft recompute hook), vercel.json (+1 cron), safety-paths test (stricter). **Removed: nothing.**

**What users see: no change.** Legacy Safety Score still serves every surface; new NSS runs in parallel until Billy signs off on cutover (Phase 5 review).

### Remaining phases ⬜
| Phase | Work | Blocked on |
|---|---|---|
| 5 | Full NSS: census per-capita, adversarial cap fixtures, companion metrics, methodology doc, cutover review | census data approval |
| 6 | Identity trust L0–L2 + anti-abuse (report rings); L3/L4 IDV | Twilio (L1), IDV vendor choice (Billy) |
| 7+8 | Guardian Score, Watch Points, Protector flip | Phase 6 |
| 9+10 | Block Strength, two-feed split, profile surfaces | — |
| 11 | Command Center scoring/integrity dashboards | everything prior |
| 12 | Full verification | everything |

---

## Billy's open action items
1. Rotate production Authorize.Net keys (compromised in chat) — before launch
2. Remove + rotate the committed Apple `.p8` key; change seeded admin passwords
3. Flip enforcement kill switch when ready (Command Center → Finance)
4. Apple/Google merchant verification when wallets are wanted
5. Twilio account when SMS/L1 phone verification is wanted
6. Census data import approval (Phase 5) · report-time GPS capture decision
7. Production smoke test at launch (one real card)
