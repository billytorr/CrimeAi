# CrimeAI — Founders' Brief

**For:** Billy Torres and the CrimeAI / BlackSeed Labs founding team.
**Purpose:** the standing picture of legal exposure, obligations and the
macro decisions that shape scale. Everything here is decision-grade — no
implementation detail, no status theatre.

**Last updated:** 2026-08-06 · **Review cadence:** monthly, and after any
change to what data the product collects.

---

## 1. Where you're exposed, ranked

Ordered by *expected cost*, not likelihood.

### 🔴 Biometric collection — the largest single liability you are taking on

Illinois **BIPA** carries a **private right of action** with statutory damages
**per person, per violation**. No harm needs to be proven. This is the statute
behind Facebook's $650M settlement and Clearview AI's. Plaintiffs' firms run
automated intake for it.

**What creates liability:** collecting a face template without written consent
obtained *beforehand*; not publishing a retention/destruction schedule; or
profiting from biometric identifiers (§15(c)) — which plausibly reaches
training a commercial model on them.

**How the current design limits it:** verify-and-discard. The biometric exists
for ≤24 hours, is never used for training, and is destroyed by both us and the
vendor. Consent is a separate onboarding step, not a ToS line. This does not
eliminate BIPA duties — it substantially reduces the exposed surface and the
per-user damages window.

**Not yet done:** attorney review, vendor DPA, automated destruction with an
audit trail you can produce in discovery. *A retention schedule you cannot
prove you followed is worse than not having one.*

### 🔴 Deceptive-practices risk from claim drift

Your published privacy claims are representations. The app previously promised
"No facial recognition" in a panel headed *What CrimeAI will never do* while
the plan of record was to collect face templates. That gap is an FTC Act §5
fact pattern, and it is provable from a screenshot.

**Now controlled by CI:** `lib/public-claims.test.ts` fails the build if the
retired absolutes return or if the privacy policy stops disclosing a category
we collect. **This is a structural control, not a promise** — but it only
covers claims that exist in the codebase. Marketing copy, App Store text
written outside the repo, and investor materials are not covered. Keep them in
step manually.

### 🟠 You will hold a uniquely dangerous database

Face data (briefly) + government ID references + home addresses + live
location + **who reported which crime**.

A breach here does not merely leak data — it can identify crime reporters to
the people they reported. That is a physical-safety event, plausibly a
headline, and existential for a product whose entire premise is safety.

**Implications for scale:** encryption at rest and in transit is table stakes.
What actually matters is *minimisation* (already the design), access control
with real audit logging, and a rehearsed incident-response plan. Cyber
liability insurance with a specific biometric-and-privacy endorsement — most
policies exclude BIPA by default. **Ask your broker to confirm in writing.**

### 🟠 Safety-critical positioning

CrimeAI is marketed around emergency features. Two consequences:

1. **Terms already disclaim it** — "NOT an emergency service, not a substitute
   for 911." Keep that prominent. It is your first defence when someone relies
   on an alert that didn't arrive.
2. **Engineering Rule 1 is a legal asset, not just a principle.** Safety paths
   contain no billing, scoring or identity checks, enforced by CI. It means a
   billing outage is *structurally incapable* of suppressing an emergency —
   which is a very different posture in litigation than "we try hard."

### 🟡 User-generated content about identifiable people

Crime reports naming or depicting individuals invite defamation and privacy
claims. **Section 230** protects you from liability for user content, but not
from the cost of being named, and not where you materially contribute to the
content — **AI-generated summaries of user reports are the grey zone.** Watch
for AI output that asserts someone committed a crime.

Current mitigations: no race/ethnicity descriptions, no predictive policing, no
stranger identification, source traceability, moderation and blocking.

### 🟡 Payments

Accept.js tokenisation keeps you in **SAQ A** — the narrowest PCI scope. Do not
let any future change put card data through your servers; it would move you to
SAQ D and a different order of audit burden.

---

## 2. Standing obligations

| Obligation | Trigger | Owner |
|---|---|---|
| Publish biometric retention schedule | before any capture | legal |
| Written biometric consent, separate from ToS | before any capture | product |
| Destroy biometrics ≤24h, with audit log | at launch of IDV | engineering |
| Honour deletion/access requests in 45 days | continuous | ops |
| Annual law-enforcement transparency report | yearly | legal |
| Re-consent on material privacy change (version bump) | per change | product |
| App Store / Play privacy labels match reality | per release | product |
| Keep marketing claims in step with practice | continuous | **founders** |

---

## 3. Macro decisions — made

| Decision | Call | Consequence to live with |
|---|---|---|
| Identity required to post/report | **Yes** | Fewer reports, skewed away from undocumented residents, DV victims and witnesses fearing retaliation. Deliberate trade. |
| Biometric retention | **Verify-and-discard, ≤24h** | Cannot train face models. Removes the largest liability. |
| ML training scope | **Everything except biometrics, IDs, DMs, payments** | Requires disclosure + opt-out; behavioural data is where model value is anyway. |
| Jurisdiction | **Comply in all states, no geofencing** | Strictest rule applies nationally. Simpler to operate, higher baseline cost. |
| Law enforcement | **Compelled process only, user notified** | Slower for agencies. This is what keeps "safety app" credible. |
| Safety paths ungated | **Absolute, CI-enforced** | No upsell in an emergency. Non-negotiable. |
| First paid tier | **Protector, $7.99/mo** | Single paid tier for now. |

## 4. Macro decisions — open

| Decision | Why it matters | Blocking |
|---|---|---|
| **IDV vendor** | Sets biometric handling, DPA terms, per-verification cost — a unit-economics input at scale | consent flow build |
| **Cyber liability insurance w/ biometric endorsement** | Most policies exclude BIPA | — |
| **Entity structure for data sharing** | CrimeAI → Torr AI / BlackSeed Labs needs a written data-sharing agreement; disclosed by name in the policy | — |
| **Moderation staffing model** | Cost scales with users, not revenue. The scaling cost founders most often underestimate | — |
| **Data-source licensing** | Some jurisdictions' feeds restrict commercial redistribution | nationwide expansion |
| **Under-18 policy** | Currently 13+, excluded from IDV. If IDV is required to post, minors cannot post at all — is that intended? | product decision |

---

## 5. What actually constrains scaling

**Moderation, not infrastructure.** Every UGC safety network hits this. Cost is
per-user and never per-revenue; automated moderation degrades exactly when
volume spikes, which is exactly when incidents matter most.

**Per-verification IDV cost.** At $1–3 per verification with identity required
to post, this is a real line item that scales with signups — including signups
that never post. Consider verifying at *first post* rather than at signup.

**Data-source coverage.** Nationwide search promises national coverage; source
quality varies enormously by jurisdiction. The gap between promise and coverage
is a churn driver.

**Vercel Hobby tier** currently caps cron jobs at one per day. Push works
around this with database triggers. Revisit before scale.

---

## 6. What protects you

Worth knowing these exist, because they are unusual and they are assets:

- **Rule 1 is structural.** CI fails the build if anyone adds a billing,
  scoring, identity or biometric check to a safety path. Mutation-tested.
- **Scoring is incorruptible by design.** The Safety Score cannot be influenced
  by engagement or payment — enforced at the module boundary. A paying user and
  a free user standing on the same corner see the same number.
- **No engagement signals in alerts.** Proven behaviourally: an item with
  99,999 likes ranks identically to one with none.
- **Public claims are CI-guarded.** The drift that created your biggest
  compliance risk cannot recur silently.
- **Payments are out of scope.** Card data never touches your servers.

These are defensible in a way that "we have a privacy policy" is not.

---

## 7. Immediate actions

| # | Action | Why |
|---|---|---|
| 1 | **Rotate the production Authorize.Net keys** | pasted in chat — treat as compromised |
| 2 | **Rotate `PUSH_EVENT_SECRET` and the APNs `.p8`** | both appeared in transcripts |
| 3 | Change seeded admin passwords | default credentials |
| 4 | Privacy attorney review of [DATA-GOVERNANCE.md](DATA-GOVERNANCE.md) | before any capture ships |
| 5 | Publish Privacy Policy **v2** to the database | the code holds only the fallback |
| 6 | Confirm cyber insurance covers BIPA **in writing** | usually excluded |
| 7 | Choose the IDV vendor | blocks the consent build |

---

## Related

- [RULES.md](RULES.md) — the engineering constraints, and which are CI-enforced
- [DATA-GOVERNANCE.md](DATA-GOVERNANCE.md) — retention, consent, LE policy, training scope
- [BUILD-STATUS.md](BUILD-STATUS.md) — what is built and verified
- [APPLE-SETUP.md](APPLE-SETUP.md) — store and push credentials

> **Not legal advice.** Written by an engineer from primary sources, to make
> the questions concrete enough that an hour with counsel is productive rather
> than exploratory.
