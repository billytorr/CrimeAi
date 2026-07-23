# CrimeAI / PSCC — Miami MVP Roadmap

**Goal:** a mobile app (iOS + Android) where a Miami resident has a real conversation
with **CrimeAI** about safety near them — grounded in real data — and walks away
trusting it more than Citizen. This document is what to build, in what order, and
exactly what you need to set up to get it live for investors.

It is scoped to **Miami only** (the doc's FL Wave-1 city), mobile-first, and
demo-ready. It maps to the full production roadmap but cuts everything not needed to
win the room.

---

## 0. TL;DR for the investor meeting

- **What's built and working today (this repo):** the entire app experience — login,
  onboarding, conversation-first CrimeAI, live map, alerts, safety report, SOS /
  walk-with-me — running on a Miami-accurate dataset with a real (or fallback) AI brain.
  It runs on a phone and **cannot fail live** (no external dependency required).
- **The one thing to turn on before the demo:** add an `ANTHROPIC_API_KEY` (or run your
  local `torr-crimeai` via Ollama) so CrimeAI answers feel world-class. 5 minutes.
- **The story:** "Citizen shows you a pin. CrimeAI has a conversation with you, explains
  the *why* with cited sources, remembers your block over time, and refuses to do the
  creepy stuff that gets these apps sued. Same real-time speed, far more trust."
- **The ask / next 90 days:** wire **live Miami-Dade data** + **real-time scanner
  ingestion** + **push/SMS alerts** + **native App Store/Play Store builds**. Costed below.

---

## 1. What "MVP works live" actually requires (priority order)

Each item is tagged **[DONE]** (in this build), **[TURN ON]** (config you do), or
**[BUILD]** (engineering before/after launch). Do them top-to-bottom.

| # | Capability | Status | Why it matters for the demo |
|---|---|---|---|
| 1 | Mobile app shell (iOS+Android feel, installable) | **[DONE]** | It has to *feel* like an app, not a website. |
| 2 | Login / signup / onboarding | **[DONE]** | "Login like every other app." First impression. |
| 3 | Conversation-first CrimeAI home | **[DONE]** | The product. This is what beats Citizen. |
| 4 | Location-grounded answers (real numbers) | **[DONE]** | Turns a chatbot into a useful product. |
| 5 | Live incident map (filters, radius, sources) | **[DONE]** | The visual that reads as "real-time safety." |
| 6 | Safety score + trends + time-of-day | **[DONE]** | The instant "is it safe?" payoff. |
| 7 | Alerts subscription UX (radius/type/channel) | **[DONE]** | The retention hook investors ask about. |
| 8 | SOS / Walk-with-me / trusted circle | **[DONE]** | The emotional, shareable moment. |
| 8b | **Social Feed (For You)** — neighbor posts, reports, news, connect | **[DONE]** | The engagement + retention engine; "connect with your city." |
| 8c | **Image/video reporting** → feed + map pin | **[DONE]** | User-generated coverage Citizen leans on; UGC moat. |
| 8d | **Inbox** — alerts + social notifications + messages | **[DONE]** | One place for everything that needs attention. |
| 9 | Trust guardrails visible in-product | **[DONE]** | The legal + PR moat, made tangible. |
| 10 | **Claude (or torr-crimeai) brain on** | **[TURN ON]** | Makes #3/#4 feel magical. *Do before demo.* |
| 11 | **Real Miami-Dade open data ingestion** | **[BUILD]** | Moves from "accurate sim" to "live." Phase 2. |
| 12 | **Real-time scanner audio (Miami-Dade hybrid)** | **[BUILD]** | Citizen's core moat; speed parity. Phase 2. |
| 13 | **Push / SMS / email delivery** | **[BUILD]** | Alerts that actually reach the phone. Phase 3. |
| 14 | **Native App Store / Play Store builds** | **[BUILD]** | "Apple app and Android app." Phase 3-4. |
| 15 | Legal: ToS, privacy, disclaimers, insurance | **[BUILD]** | Launch-blocker before public beta. Phase 1.5. |

**Minimum to demo live to an investor:** items 1–10 (today + one env key).
**Minimum to launch a public Miami beta:** add 11, 13, 14, 15.

---

## 2. Exactly what YOU need to set up (step by step)

### Before the demo (today, ~15 min)
1. `npm install` then `npm run dev` (see README). Confirm it loads on your laptop.
2. **Get a Claude API key** at console.anthropic.com → put `ANTHROPIC_API_KEY` in
   `.env.local`. (Or start Ollama with your `torr-crimeai` model — zero cost.)
3. Restart `npm run dev`. Ask CrimeAI a question; confirm the chat footer says
   `engine: Claude` (or `torr-crimeai`).
4. Test on your phone via LAN IP + **Add to Home Screen** (README §4). Now you can
   hand an investor an actual phone.

### Before a public beta (founder decisions + accounts to create)
5. **Swap auth** to Clerk or Supabase (replace `lib/auth.ts`). ~2 days eng.
6. **Stand up Postgres + PostGIS** (Supabase or a $15/mo managed DB) and point the
   ingestor at it. ~3 days eng.
7. **Apply for data access** (do these early — they take weeks):
   - Miami-Dade / City of Miami open data — free, immediate.
   - **Broadcastify** scanner API — email `support@broadcastify.com`, describe the
     consumer-safety use case (relationship-driven; start now).
   - **Nextdoor** developer API — `developer.nextdoor.com` (free w/ approval).
   - **SpotCrime** — `api@spotcrime.com` for breadth (optional, paid).
8. **Notifications:** create Firebase (FCM, Android), Apple Developer account (APNs +
   App Store), Twilio (SMS), Postmark/Resend (email).
9. **Legal:** engage a lawyer for ToS + privacy policy + the "informational, call 911"
   disclaimer (~$1–3k). Florida note below.
10. **Insurance:** get an E&O / cyber-liability quote (~$2–10k/yr consumer tier).
11. **Deploy:** Vercel (fastest) or a VPS + Cloudflare (README §5).

### Founder decisions only you can make
- Brand name shown to consumers (CrimeAI stays the engine; consumer brand can differ).
- Pricing (free beta → $4.99/$9.99/$19.99 tiers).
- Who runs the human-in-the-loop alert review during beta (see §4).
- Whether to pursue the separate B2B law-enforcement tier later (much higher bar).

---

## 3. How this beats Citizen (the pitch, feature by feature)

| | Citizen | **CrimeAI / PSCC** |
|---|---|---|
| Core interaction | A feed of pins + clips | **A conversation.** Ask anything, get a grounded answer. |
| "Why am I seeing this?" | No answer | **Cited explanation** with sources + confidence. |
| Memory of your block | None | **Longitudinal context** — "3rd break-in on your block this month." |
| Trust posture | Has caused panics / mis-IDs | **Hard guardrails**: no facial recognition, no race descriptions, no profiling — shown in-app. |
| Source honesty | Implies it sees everything | **Coverage matrix** tells you what's live / partial / unavailable. |
| Data provenance | Opaque | Every incident shows **source + confidence + corroboration**. |
| Safety summary | Manual scanning | **Instant safety score + time-of-day risk** per address. |
| Personal safety | Limited | **Walk-with-me, SOS, trusted circle**, always one tap away. |

The wedge: **Citizen optimized for adrenaline; CrimeAI optimizes for trust and
understanding.** Trust is the moat — every competitor that crossed the creepy line got
sued or banned. We treat the limits as features.

---

## 4. Phase plan (90 days to public Miami beta)

**Phase 1 — Demo-ready (DONE in this repo).** Mobile app, conversation, map, alerts UI,
safety report, SOS, on the Miami dataset + AI brain. *You are here.*

**Phase 1.5 — Make it launchable (1–2 weeks).** Real auth (Clerk/Supabase),
Postgres+PostGIS, ToS/privacy/disclaimer + insurance quote, deploy to a real URL.

**Phase 2 — Make it live (3–4 weeks).** Miami-Dade + City of Miami open-data ingestor
into the normalized incident schema (already defined in `lib/types.ts`). Then layer
**Miami-Dade hybrid scanner audio** via Broadcastify + Whisper STT → CrimeAI extraction
→ a lightweight **human-review queue** (one part-time analyst) before high-stakes alerts
go out. This is Citizen's actual moat, built lean.

**Phase 3 — Make it reach the phone (3–6 weeks).** Web push + SMS (Twilio) + email,
the alert engine on a 5–15 min cron, and **native wrappers**: wrap this exact app in
**Capacitor** to ship real iOS + Android binaries to the App Store and Play Store
(reuses 100% of the UI; APNs/FCM push, native location, home-screen presence).

**Phase 3.5 — Productionize the social layer.** Real user network (the Feed/Inbox/
reports already work on a seeded network) needs: a backend for posts/follows/likes, an
**object store** for uploaded media, **content + media moderation** (the human-in-the-loop
queue extends here), a **live local-news feed** (news API or RSS), and abuse/harassment
controls. The civil-liberties guardrails (no naming/identifying individuals in reports)
are already enforced in the report UI copy and CrimeAI prompt.

**Phase 4 — Grow.** More FL/TX cities, paid tiers, HOA/property-manager B2B, and the
separate, compliance-heavy law-enforcement tier (only after consumer credibility).

---

## 5. Miami-specific notes (don't skip)

- **Marsy's Law (Florida):** some agencies redact victim/address-level data, and using
  crime-victim records for *commercial solicitation* is a third-degree felony. The app
  is informational, not solicitation — but **never display victim-identifying data**,
  and get the FL data layer lawyer-reviewed before public launch.
- **Scanner reality:** Miami-Dade is **hybrid** — some channels are real-time, some
  aren't. The in-app coverage matrix already communicates this honestly. Don't promise
  full scanner coverage.
- **Open data:** Miami-Dade (ArcGIS hub + crime dashboard) and City of Miami
  (developer portal) are the depth layer; SpotCrime/Nextdoor add breadth.

---

## 6. Rough monthly cost (Miami beta, <1k users)

| Item | Est. |
|---|---|
| Hosting (Vercel/VPS) + managed Postgres | $40–80 |
| Object storage, Redis, domain, Cloudflare | $10–25 |
| Claude API (CrimeAI brain, light traffic) | $20–150 |
| Geocoding (Mapbox, free tier covers start) | $0–10 |
| Broadcastify + STT compute (when live) | $50–200 |
| SMS/email (Twilio/Postmark) | $10–30 |
| Part-time alert analyst (beta) | $0 (founder) → ~$2,000 |
| **Subtotal** | **~$130 → ~$700/mo** |

Plus one-time legal (~$1–3k) and annual insurance (~$2–10k). Native app-store fees:
Apple $99/yr, Google $25 once.

---

## 7. The unblocking move

Per the source roadmap: the first move that unblocks everything is **Postgres + PostGIS
plus the free Miami open-data ingestor** (Phase 2 start). This repo already implements
the normalized schema and all the query/scoring logic against it — swapping the seed
file for a live ingestor is the single highest-leverage next task.

Built by Billy Torres · BlackSeed Labs / TORR AI. *Informational only — call 911 in an emergency.*
