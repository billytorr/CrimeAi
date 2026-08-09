# CrimeAI — Data Governance

Billy's decisions, 2026-08-06, turned into a buildable specification.

> ⚠️ **Draft for counsel.** The consent language and retention periods here are
> researched but not legal advice. A BIPA-experienced privacy attorney should
> approve this document before any capture ships. It is written to be handed
> to them — the decisions are made, so the review should be fast.

---

## The one conflict, and how it resolves

Two of the six answers cannot both be satisfied:

| Answer 5 | Answer 6 |
|---|---|
| "Learn everything… **future-proof the data** for future innovation" | "**Comply to all states** and their jurisdictions" |

Every US biometric statute is built on *destruction* deadlines and *purpose
limitation*. Retaining biometrics indefinitely for undefined future uses is the
specific thing they prohibit:

- **Illinois BIPA §15(a)** — destroy when the purpose is satisfied **or** 3
  years after last interaction, **whichever comes first**. The policy must be
  published.
- **Texas CUBI §503.001** — destroy within **1 year** after the purpose
  expires. Stricter than Illinois.
- **BIPA §15(c)** — **no selling, leasing, trading or otherwise profiting from**
  biometric identifiers. Training a commercial model (Torr AI) on face
  templates is squarely in the contested zone here.
- **CPRA / CO / CT / VA** — purpose limitation and data minimisation: collect
  and keep only what is reasonably necessary for a **disclosed** purpose. "For
  innovations we haven't thought of yet" is definitionally undisclosable.

**Answer 6 wins**, because you chose it. Compliance is the binding constraint,
so the schedule below has real destruction deadlines and biometrics stay out of
model training. Everything in answer 5 that *is* compatible — engagement,
posts, usage, behaviour — is retained broadly and does train models.

---

## Recommended architecture: verify-and-discard

**Capture everything you listed. Keep the biometric only as long as it takes to
verify, then destroy it and keep the *result*.**

```
selfie + ID scan  →  IDV vendor  →  match result
       │                                  │
       └── destroyed within 24h ──►       ├── identity_level: L3
           (ours AND vendor's,            ├── verified_at, method
            per DPA)                      ├── over_18: true
                                          ├── name/DOB match: true
                                          └── vendor_reference: <opaque id>
```

This gives you everything you actually named:

| You wanted | Verify-and-discard delivers |
|---|---|
| Identity required to post/report | ✅ `identity_level` gates posting |
| Legal/evidentiary value | ✅ you can attest under oath that a user was ID-verified, when, by whom |
| Work with law enforcement | ✅ respond to process with the attestation + vendor reference; the vendor holds the underlying record under its own compliance regime |
| Future-proofing | ✅ for behavioural data, which is where the model value actually is |

What it gives up: training face-recognition models on your users' faces. BIPA
§15(c) likely prohibits that anyway, and it is the single highest-liability
thing in the plan.

**Why this matters beyond compliance:** the alternative is a database holding
face templates + ID documents + home addresses + live location + a record of
who reported which crime. Breached, that identifies crime reporters to the
people they reported. For a safety app that is not a privacy problem, it is a
*safety* problem — the exact harm the product exists to prevent.

---

## 1. What is captured

Per answer 1 — all of it, at the verification step:

| Data | Captured | Retained after verification |
|---|---|---|
| Selfie image | ✅ | ❌ destroyed ≤24h |
| Face template / embedding | ✅ (by vendor) | ❌ destroyed ≤24h, ours and vendor's |
| Government ID scan | ✅ | ❌ destroyed ≤24h |
| ID number | ✅ | ❌ — store `last4` + issuing state only |
| Date of birth | ✅ | ⚠️ store `over_18` + `over_21` booleans; full DOB only if counsel confirms a need |
| Legal name | ✅ | ✅ retained |
| Verification result | — | ✅ level, method, timestamp, vendor reference |

## 2. Consent — BIPA-compliant, in onboarding

Per answer 2. BIPA requires a **written release, separate from the ToS,
obtained before capture**. A ToS checkbox does not satisfy it.

**Requirements the screen must meet:**

1. Its own step, before the camera ever opens — not bundled into ToS acceptance
2. States **what** is collected (selfie, face template, ID document)
3. States the **specific purpose** (identity verification for CrimeAI)
4. States the **retention and destruction schedule**, in plain language
5. States whether it is **disclosed to anyone** (the IDV vendor — name them)
6. An affirmative action to consent — an unticked box or an explicit button,
   never a pre-ticked one or an "by continuing you agree"
7. **Declining must be possible** and must not break the app
8. The consent record is stored: user id, policy version, timestamp, IP,
   exact text shown — you must be able to prove *what* they agreed to

**Draft copy** (for counsel to redline):

> **Verify your identity**
>
> To post and report on CrimeAI, we need to confirm you are a real person.
>
> We'll ask for a photo of yourself and a photo of your government ID. Our
> verification partner, **[VENDOR]**, uses these to generate a face template
> and confirm the ID matches you.
>
> **We delete your selfie, your ID image and the face template within 24 hours
> of verification**, and [VENDOR] deletes their copies on the same schedule. We
> keep only the result: that you were verified, when, and by what method.
>
> We do not sell this data, and we do not use it to train AI models.
>
> ☐ I have read this and consent to CrimeAI and [VENDOR] collecting and
> storing my biometric identifiers as described.
>
> [ Verify my identity ]     [ Not now ]

## 3. Retention schedule

Per answer 3. Published version goes in the Privacy Policy — BIPA requires it
to be publicly available.

| Data class | Retention | Driver |
|---|---|---|
| Selfie, ID image, face template | **24 hours** from verification | BIPA §15(a) / CUBI — purpose satisfied at verification |
| ID number | not retained (`last4` + state only) | breach-liability minimisation |
| Full DOB | not retained (booleans only) | minimisation; revisit only if counsel identifies a need |
| Verification result, vendor reference | **7 years** after account closure | evidentiary value; matches typical records-retention practice |
| Legal name, account, profile | life of account + **90 days** | operational |
| Posts, reports, comments, corroborations | life of account; **anonymised** on deletion (author unlinked, content retained) | community record survives; the person doesn't |
| Engagement + usage analytics | **7 years**, pseudonymous after 24 months | answer 5 — the model-training corpus |
| Location history | **13 months** precise, then coarsened to ZIP | balances alerting against surveillance risk |
| Device tokens | until invalidated | operational |
| Payment records | **7 years** | tax/audit |
| Consent records | **life of account + 7 years** | you must be able to prove consent after it lapses |
| Law-enforcement request log | **permanent** | transparency reporting |

**Deletion requests (CCPA/CPRA and friends):** honoured within 45 days.
Verification results and consent records survive as a legal-obligation
exception; posts are anonymised rather than destroyed. This must be stated in
the Privacy Policy, not just done.

## 4. Law enforcement

Per answer 4 — a safety app that cooperates, not a surveillance vendor. The
difference is entirely whether cooperation runs on **legal process** or on
**discretion**.

**Policy:**

1. **Compelled disclosure only** — subpoena, court order, or warrant, matched
   to the sensitivity of what is sought. Voluntary bulk disclosure: never.
2. **Emergency exception** — a good-faith belief in imminent danger of death or
   serious injury permits immediate disclosure without process (18 U.S.C.
   §2702(b)(8)). Logged and reviewed after the fact.
3. **Notify the user** before disclosing, unless legally barred or it is an
   emergency. This is the single line that most distinguishes a safety app from
   a surveillance vendor.
4. **Minimum scope** — produce what the process demands, nothing adjacent.
   Push back on overbroad requests.
5. **Log every request** — who, what, legal basis, what was produced.
6. **Publish a transparency report** — request counts and outcomes, annually.
7. **No standing access.** No API, portal or bulk feed for any agency. Every
   request is individually reviewed.

Written into the Privacy Policy so it is a public commitment, not an internal
preference that quietly erodes.

## 5. ML training scope

Per answer 5, bounded by answer 6.

**Trains models (broad — this is the corpus):**
posts, comments, reports, corroborations · engagement and interaction patterns ·
search and Ask queries · navigation, session and feature usage · alert
response behaviour · scoring inputs and outcomes · incident and geographic data

**Never trains models:**
biometric identifiers or templates (BIPA §15(c)) · ID documents or numbers ·
DM content · precise home address · payment credentials · anything from a user
who opted out

**Requirements:**
- Disclosed in the Privacy Policy **before** collection, naming Torr AI and
  BlackSeed Labs as recipients
- **Opt-out** available in Settings (CPRA-adequate); flag honoured
  retroactively for future training runs
- Training corpus is **pseudonymous** — stable per-user id, no direct
  identifiers
- Cross-entity sharing (CrimeAI → Torr AI / BlackSeed Labs) needs a written
  data-sharing agreement and must be disclosed by name

### 5a. CrimeAI assistant — personal memory + model improvement (2026-08-07)

Billy's decision: CrimeAI must keep **personal memory** per user and must be
able to **improve the shared model** from usage, "in the best practical way."
Both are adopted, with the guardrails that make them lawful rather than
optional niceties:

**Personal memory (per user, private).** The assistant retains a private,
per-user memory across their threads — their neighbourhood, their reports,
recurring concerns, uploaded documents they asked it to remember.
- Scoped to `user_id`; **one user's memory never reaches another's answers.**
- Stored pseudonymously, surfaced only to that user's own sessions.
- **Viewable and erasable** by the user in Settings (a memory you cannot see
  or delete is a liability, not a feature). Deletion is honoured immediately.
- Uploads are covered here: a file a user shares is readable within *their*
  memory only.

**Shared-model improvement.** Behavioural and conversational data may improve
the shared CrimeAI model, under the training rules above **plus**:
- The exclusions are **absolute and unchanged**: biometric identifiers, ID
  documents/numbers, DM content, precise home address and payment credentials
  **never** train anything, memory or shared model. Adding assistant memory
  does not widen that list.
- **Uploaded content trains the shared model only with explicit, separate
  opt-in** — distinct from using it in the user's own chat. Reading your file
  to answer you (per-conversation) is the default and needs no extra consent;
  contributing it to the shared corpus is opt-in.
- Human-review and retraining sets are **pseudonymised and PII-scrubbed**
  before anyone or anything sees them.
- A user who opts out of training keeps full personal memory — the two are
  independent switches.

**Still required before this shships (Billy owns):**
- Privacy Policy update describing personal memory + the upload-training
  opt-in (the current v2 covers behavioural training, not memory or uploads).
- Counsel review of the upload-training opt-in specifically — user-generated
  uploads can contain third parties' data, which is a different risk surface
  from a user's own posts.

## 6. Jurisdiction

Per answer 6 — comply everywhere, no geofencing. That means designing to the
**strictest** rule and applying it nationally:

| Requirement | Strictest source | Applied |
|---|---|---|
| Written consent before biometric capture | IL BIPA | nationally |
| Published retention + destruction schedule | IL BIPA | nationally |
| Biometric destruction | TX CUBI (1yr) → we use 24h | nationally |
| No profit from biometrics | IL BIPA §15(c) | nationally |
| Sensitive-data consent | CO/CT/VA | nationally |
| Right to delete / access / correct | CA CPRA | nationally |
| Right to opt out of profiling | CO/CT | nationally |
| Minor protections | COPPA + state | 13+ only; under-18 excluded from IDV |

Not adopted: GDPR. Add only if you launch in the EU — it would require a DPO,
lawful-basis analysis and DPIAs.

---

## Product changes required before any capture ships

| # | Change | Why |
|---|---|---|
| 1 | Rewrite "What CrimeAI will never do" panel ([CoverageMatrix.tsx:49](components/CoverageMatrix.tsx)) | currently promises no facial recognition |
| 2 | Rewrite site/store description ([layout.tsx:6](app/layout.tsx)) | same claim |
| 3 | Privacy Policy **v2** ([legal.ts](lib/legal.ts)) — biometrics, retention schedule, LE policy, training disclosure, cross-entity sharing | v1 discloses none of it |
| 4 | BIPA consent step in onboarding + `biometric_consents` table | §2 above |
| 5 | Settings: training opt-out, data export, deletion request | CPRA |
| 6 | Automated destruction job + audit log | a schedule you can't prove you followed is worse than none |
| 7 | App Store / Play privacy labels updated | must match actual collection |
| 8 | IDV vendor with a BIPA-compliant DPA and 24h deletion | vendor still undecided |

**Do not ship 4 before 1–3.** Capturing biometrics while the app still says it
never will is the fact pattern that turns a compliance question into a
deceptive-practices one.
