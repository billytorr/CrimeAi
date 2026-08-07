# CrimeAI — App Store Submission Kit

Copy-paste into App Store Connect. Bundle ID **com.pscc.crimeai** · Rewritten
2026-08-07 for v1.0.

⚠️ The previous version of this file predated identity verification, the
biometric app lock, wallet payments and AI training. Its privacy labels were
wrong. **The App Privacy section below must match
`ios/App/App/PrivacyInfo.xcprivacy` and the published Privacy Policy** — a
mismatch between the three is a rejection, and once live it is a
deceptive-practices problem. See DATA-GOVERNANCE.md.

---

## Promotional Text (170 max — editable without review)

```
Real safety intelligence for your block. See what's actually happening nearby, report what you witness, and ask CrimeAI anything about staying safe.
```

## Description (4000 max)

```
CrimeAI is a neighborhood safety network built on real data.

SEE WHAT'S HAPPENING
A live map of incidents around you, drawn from official records and verified neighbor reports. Every incident is traceable to its source, with a confidence level — so you know what's confirmed and what's still a claim.

YOUR SAFETY SCORE
Every neighborhood gets a Safety Score built from incident severity, recency and distance, compared against your metro area. It shows its work: what's driving the number, how confident it is, and what changed. It is never influenced by engagement or by whether anyone paid us.

ASK CRIMEAI
Ask about your street, a route you're taking, or a place you're thinking of moving to. Answers come with citations to the data behind them.

ALERTS THAT FIT YOUR LIFE
Choose your radius, the categories you care about, and how severe something has to be before it reaches you. Alerts are ranked by relevance to your safety — never by what's popular.

SAFETY FEATURES, FREE FOR EVERYONE
SOS, "I'm not safe", Walk-with-me, one-tap 911 and Trusted Circle dispatch work on every plan, including the free one. They are never behind a paywall, and a billing problem can never switch one off.

REPORT WHAT YOU WITNESS
Post what you see so your neighbors know. Filing a crime report requires a verified ID — reports pin to the map and people act on them, so they come from real, accountable people. Everything else works without it.

WHAT CRIMEAI WILL NEVER DO
· Identify a stranger from a photo
· Describe anyone's race or ethnicity
· Predict who will commit a crime
· Sell your data to advertisers or data brokers
· Give any agency standing or bulk access to our data

PROTECTOR PLAN
A wider alert radius, full incident history, a deeper Safety Score breakdown, a larger trusted circle, SMS alerts and the red Protector shield beside your name. $7.99/month or $69.99/year.

IMPORTANT
CrimeAI is an informational community safety network. It is NOT an emergency service and not a substitute for 911. Community reports are unverified information. In an emergency, call 911.
```

## Keywords (100 max, comma separated, no spaces)

```
crime,safety,neighborhood,alerts,map,police,scanner,incident,report,community,watch,local,news,sos
```

## URLs

| Field | Value |
|---|---|
| Support URL | `https://publicsafetycrimecenter.com/support` |
| Marketing URL | `https://publicsafetycrimecenter.com` |
| Privacy Policy URL | `https://publicsafetycrimecenter.com/privacy` |
| Copyright | `2026 BlackSeed Labs LLC` |

⚠️ The Support URL must resolve to a real page with a contact method —
reviewers check it, and Guideline 1.2 requires published contact info for a
UGC app.

---

## App Privacy — must match PrivacyInfo.xcprivacy

For each, answer **linked to identity: Yes · used for tracking: No**.

| Data type | Purpose |
|---|---|
| Precise Location | App Functionality |
| Coarse Location | App Functionality |
| Email Address | App Functionality |
| Name | App Functionality |
| Phone Number | App Functionality |
| Photos or Videos | App Functionality |
| Other User Content | App Functionality |
| Product Interaction | App Functionality **+ Analytics** |
| Device ID | App Functionality |
| Payment Info | App Functionality |

**Do NOT declare biometric data.** Face ID unlock never gives the app the
template — it stays in the Secure Enclave. Identity verification is not in
this build. When IDV ships, this section, the manifest and the Privacy
Policy all change together.

---

## App Review Information

**Demo account — required.** Reviewers cannot get past sign-in without one,
and this is the most common cause of a first rejection.

| Field | Value |
|---|---|
| Sign-in required | Yes |
| Username | *(create a real account, completed onboarding, in a populated area)* |
| Password | *(set one; never reuse a personal password)* |

**Notes for review:**

```
CrimeAI is a community safety network. The demo account is fully onboarded and located in Miami, FL, where there is live incident data to see.

WHAT TO TRY
· Feed — neighbor posts and reports
· Map — live incidents with sources
· Ask — question the AI about a neighborhood
· Profile → My Safety — the Safety Score with its breakdown

USER-GENERATED CONTENT (Guideline 1.2)
Posts can be reported and authors blocked from the "..." menu on any post. Reported content reaches a moderation queue reviewed daily. Blocked users disappear from feed, search and messaging. Terms prohibit identifying private individuals and require reporting only what was witnessed.

SUBSCRIPTIONS
The Protector plan is sold on our website, not through in-app purchase. The app links out to publicsafetycrimecenter.com in the device browser. The service is available and purchasable independently of the app.

EMERGENCY FEATURES
SOS, Walk-with-me and one-tap 911 hand off to the system dialer and the user's own contacts. CrimeAI does not dispatch emergency services and states this in the Terms and in the app.
```

---

## Age Rating

Answer honestly; the crime subject matter and user-generated content both
raise it.

| Question | Answer |
|---|---|
| Realistic Violence | Infrequent/Mild |
| Horror/Fear Themes | Infrequent/Mild |
| Profanity or Crude Humor | Infrequent/Mild (user content) |
| **Unrestricted Web Access** | **No** |
| **User Generated Content** | **Yes** |
| Contests / Gambling / Drugs | None |

Expect **17+**. UGC alone usually forces it, and understating it to reach a
lower rating is its own violation.

---

## Screenshots

6.5" iPhone is required (1242×2688 or 1284×2778). Only the first three show
on the install sheet — order them deliberately:

1. **Map** with live incidents
2. **Safety Score** with the breakdown open
3. **Ask CrimeAI** with a cited answer
4. Feed
5. Alerts / radius settings

Capture on a real device with real data. Empty states read as a broken app.

---

## Before you submit

- [ ] TestFlight on a real device — push registration, Face ID lock, purchase opens Safari
- [ ] Support URL resolves with a contact method
- [ ] Demo account works from a clean install
- [ ] Privacy labels match `PrivacyInfo.xcprivacy` exactly
- [ ] Privacy Policy v2 published to the database (the app ships only a fallback)
- [ ] **Decide the external-purchase question** — permitted for US-storefront apps post-*Epic*; likely rejected elsewhere. See FOUNDERS.md.
