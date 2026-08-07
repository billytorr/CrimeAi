# CrimeAI / PSCC — Rules

The constraints this app is built under. **This file is the source of truth.**
Edit it, and the code and CI guards get changed to match — not the other way
round.

Two categories, and the difference matters:

- **🔒 ENFORCED** — a CI test fails the build if the rule is broken. These are
  structural: no amount of carelessness later can quietly undo them.
- **📋 POLICY** — agreed and followed, but nothing stops a future change from
  violating it. Any of these can be promoted to 🔒 on request.

Last reviewed: 2026-08-06.

---

## 🔒 Rule 1 — Safety paths have zero gating

**SOS, Walk-with-me, one-tap 911, Trusted-Circle dispatch and critical-severity
alert dispatch contain no tier, entitlement, subscription, score, identity or
biometric check — not even one that always returns true.**

If there is no lookup in the path, then a billing outage, a scoring bug, a
database failure or an expired card is *structurally incapable* of suppressing
an emergency.

Extended 2026-08-06 for the biometric app lock: the lock screen renders the
real SOS component unconditionally, and an unavailable sensor fails **open**.
Biometrics fail routinely — a mask, the dark, wet or shaking hands — and
"authenticate before you can call for help" is the one failure this app
cannot ship.

*Enforced:* `lib/entitlements/safety-paths.test.ts` (11 tests),
`lib/push/send.test.ts`. Covers `components/SOS.tsx`, `components/AppLock.tsx`.
Mutation-tested — each guard was deliberately broken and confirmed to fail CI.

## 🔒 Rule 2 — The Safety Score is never influenced by engagement or payment

The NSS computation cannot import the entitlement, subscription or
gamification layers. `nss.ts` and `geo.ts` are **pure** — they may import only
`./config` (types) and `./geo`. Orchestration files may touch the neutral DB
client and incident data, never billing or reputation logic.

A paying user and a free user standing on the same corner see the same number.

*Enforced:* `lib/scoring/boundary.test.ts`, at the module boundary.

## ~~Rule 3 — Identity is never required to post or report~~ — REMOVED

**Removed 2026-08-06 by Billy.** Identity verification may now be required to
post or report. Replaced by the open decisions in *Data & identity* below.

*Consequence to weigh:* mandatory ID suppresses reporting most from the people
whose reports matter most — undocumented residents, domestic-violence victims,
and witnesses who fear retaliation. Expect fewer reports, skewed away from the
neighbourhoods with the least trust in institutions. Worth deciding
deliberately, not as a side effect.

## ~~Rule 4 — No biometric or ID-document data is ever stored~~ — REMOVED

**Removed 2026-08-06 by Billy.** Intent: capture biometric and identity data
for law-enforcement/legal use, and broaden what CrimeAI learns about users to
train Torr AI and CrimeAI models.

Replaced by the open decisions in *Data & identity* below. **Nothing has been
built** — the CI guard in `lib/identity/rules.test.ts` still blocks biometric
columns until those decisions are made, because collecting this data without a
consent mechanism is unlawful in several states on day one.

---

## 📋 Data & identity — DECIDED 2026-08-06

Billy answered all six questions. Full specification in
**[DATA-GOVERNANCE.md](DATA-GOVERNANCE.md)**; summary:

1. **Capture** selfie, face template, ID document, ID number, DOB — all of it
2. **BIPA consent** as its own onboarding step, before any capture
3. **Retention schedule** published, per data class
4. **Law enforcement**: cooperate on legal process; safety app, not a
   surveillance vendor
5. **Train on everything** except biometrics, IDs, DMs and payment data
6. **Comply in all states** — strictest rule applied nationally, no geofencing

**Where 5 and 6 collided, 6 won** (Billy's stated priority): biometrics carry
real destruction deadlines and stay out of model training, because every US
biometric statute is built on destruction and purpose limitation. Behavioural
data — the part with actual model value — is retained broadly.

**Architecture: verify-and-discard.** Capture everything, keep the biometric
only long enough to verify (≤24h), then destroy it and retain the *result*.
Preserves identity gating, evidentiary value and LE cooperation while removing
the highest-liability asset from the database. See DATA-GOVERNANCE.md §
"Recommended architecture" for why this also protects crime reporters.

### Superseded — kept for history

Removing Rules 3 and 4 is a policy change. Turning it into code needs answers
to the following, because the wrong default here is not a bug — it is
statutory damages and an App Store removal.

### 1. Two public promises now contradict the plan

These ship in the product **today** and must be changed before any biometric
capture exists, or they become actively deceptive:

| Where | Text |
|---|---|
| `app/layout.tsx:6` — site/store description | "No facial recognition, no profiling." |
| `components/CoverageMatrix.tsx:49` — in-app panel headed **"What CrimeAI will never do"** | "No facial recognition — we never identify strangers from a photo." |
| same panel | "No predictive policing or profiling of people." |
| `lib/legal.ts` — published Privacy Policy v1 | enumerates what we collect; biometrics are **not** in the list |

A published privacy policy is a representation. Collecting a category it does
not disclose, while an in-app panel promises the opposite, is the textbook FTC
Act §5 deceptive-practice fact pattern — and here it is provable from a
screenshot.

### 2. Biometric law is consent-first, and Illinois has teeth

**Illinois BIPA** requires written consent *before* collection, a published
retention/destruction schedule, and bars profiting from biometric identifiers.
It carries a **private right of action** with statutory damages **per person,
per violation** — the statute behind Facebook's $650M and Clearview AI's
settlements. Texas (CUBI), Washington, Colorado, and CCPA/CPRA (biometrics =
sensitive personal information) add their own duties; GDPR Art. 9 treats
biometrics as a special category if there are ever EU users.

CrimeAI search is nationwide, so Illinois and Texas users are not hypothetical.

### 3. Questions that must be answered before code

1. **What exactly is captured?** Selfie image, face *template/embedding*, ID
   document scan, DOB, government ID number? Each has a different legal
   footing — a stored template is the one BIPA is aimed at.
2. **What is the consent flow?** BIPA needs a written release, separate from
   the general ToS, obtained *before* capture.
3. **Retention and destruction schedule?** Must be published. BIPA's default
   ceiling is 3 years after last interaction.
4. **Law-enforcement disclosure standard?** Warrant/subpoena only, or
   voluntary? Published policy or discretionary? This determines whether
   CrimeAI is a safety app or a surveillance vendor, in users' eyes and a
   court's.
5. **ML training scope.** "Learn as much as it can" needs a boundary: which
   fields train models, is training opt-in or opt-out, and does biometric data
   enter training at all? (BIPA's no-profit clause is implicated.)
6. **Jurisdiction strategy.** Geofence Illinois/Texas out of biometric
   capture, or comply everywhere?

**Recommendation:** get an hour with a privacy attorney before writing any of
this. Not a general counsel — someone who has litigated BIPA. The design
choices above are cheap to make now and very expensive to unwind after
launch.

## 🔒 Rule 12 — No engagement signals in the alerts ranker

The alerts ranker may not reference likes, comments, shares, reposts, views,
follows, upvotes or engagement, and may not import the social module. Proven
behaviourally, not just textually: an item with 99,999 likes scores
**identically** to the same item with none.

Alerts are ranked by relevance to your safety, never by what is popular.

*Enforced:* `lib/scoring/alerts-ranker.test.ts`.

## 🔒 Rule — Crime rate is not an input to Block Strength

Block Strength measures how well-watched a place is, not how dangerous. It may
not import the NSS/hazard computation, and no input field may carry incident,
crime, hazard or severity data. Reports count only as *participation*.

Otherwise a safe block and a watched block become the same number, and the
whole four-layer design collapses.

*Enforced:* `lib/scoring/block-strength.test.ts`.

## 🔒 Rule — Watch Points are non-transferable and non-cashable

There is no transfer kind in the ledger, rows are append-only (enforced by a
Postgres trigger), and balances can never go negative.

*Enforced:* `supabase/guardian.sql` schema + trigger.

---

## 📋 Payments & security

- **Card data never touches our servers.** Accept.js / Accept Hosted
  tokenisation only — SAQ A scope. No PAN, CVV or expiry in our code, logs or
  database, ever.
- **Secrets live only in Vercel environment variables**, set by Billy. Never in
  chat, code, commits or docs. `.gitignore` covers `*.p8`.
- **Entitlement fails OPEN** — a billing or config failure degrades to free-tier
  behaviour, never to a locked app. *Exception:* cost paths (AI inference, SMS)
  fail **closed** to free-tier limits, so an outage can't run up a bill.
- **`kind: "safety"` push bypasses the user's notification preference.** An
  emergency must reach the device even if routine alerts are muted. Routine
  `alert` notifications respect the preference.

## 📋 Product

- **Native iOS + Android**, not a web app in a wrapper.
- **Conversation-first** — CrimeAI is the primary interface.
- **Real login.** No fake or demo auth in shipped builds.
- **No facial recognition, no profiling.** Stated publicly in the app's own
  description; must remain true.
- **Nationwide search.** Originally Miami-first; the geographic guardrail was
  removed.
- **Permissions are requested contextually**, never up front: notifications at
  the end of onboarding (after the user sets an alert radius and opts in),
  camera/mic at capture, location on an explicit tap. Trusted contacts are
  typed by hand — we never read the OS address book.

## 📋 Process

- **Additive-only changes** unless removal is explicitly agreed.
- **STOP at each phase boundary** for approval before continuing.
- **Check the full codebase before and after** a change of any size.
- **Report honestly** — say what is verified, what is assumed, and what failed.

---

## Open items Billy owns

| Item | Status |
|---|---|
| ~~Answer the six Data & identity questions~~ | ✅ answered 2026-08-06 |
| **Attorney review of [DATA-GOVERNANCE.md](DATA-GOVERNANCE.md) — BIPA-experienced** | **before any capture ships** |
| **Choose the IDV vendor** (needs a BIPA-compliant DPA + 24h deletion) | blocking the build |
| Rewrite the "What CrimeAI will never do" panel + site description + Privacy Policy v2 | **must land before capture** |
| Rotate the production Authorize.Net keys (pasted in chat — compromised) | outstanding |
| Rotate `PUSH_EVENT_SECRET` (appeared in a screenshot) | outstanding |
| Rotate the APNs `.p8` `6UA7W3YC7X` (contents appeared in chat) | outstanding |
| Change seeded admin passwords | outstanding |
| Production payment smoke test | outstanding |
| IDV vendor choice | undecided |
| Twilio account for SMS | not set up |
