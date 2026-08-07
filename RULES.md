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

## 🔒 Rule 3 — Identity is never required to post or report

An L0 (unverified) user files a report exactly like an L4 user. The report
path — composer → `addPost` → insert — contains no identity reference at all.
Verification changes how much a report *weighs*, never whether it can be made.

*Enforced:* `lib/identity/rules.test.ts`. Covers `components/ComposeSheet.tsx`,
`lib/social.ts`.

## 🔒 Rule 4 — No biometric or ID-document data is ever stored

No column in any migration may hold a face image, face template/embedding, ID
document, ID number or date of birth. `over_18 boolean` is the single
permitted age fact.

Face ID / fingerprint unlock does **not** violate this: iOS and Android keep
the template in the Secure Enclave / TEE and return only a yes/no. We never
receive, transmit or store anything biometric.

*Enforced:* `lib/identity/rules.test.ts` scans **every** migration file.

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
| Rotate the production Authorize.Net keys (pasted in chat — compromised) | outstanding |
| Rotate `PUSH_EVENT_SECRET` (appeared in a screenshot) | outstanding |
| Rotate the APNs `.p8` `6UA7W3YC7X` (contents appeared in chat) | outstanding |
| Change seeded admin passwords | outstanding |
| Production payment smoke test | outstanding |
| IDV vendor choice | undecided |
| Twilio account for SMS | not set up |
