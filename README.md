# CrimeAI — PSCC (Public Safety Crime Center)

**A mobile, conversation-first public-safety app for Miami.** Talk to CrimeAI about
safety near you and get grounded answers from real, cited data — with a live map,
smart alerts, and one-tap emergency features. Built to beat Citizen on trust and
intelligence, not just speed.

This is the **Miami MVP**: a **fully responsive** mobile-first app that runs on **any
iOS or Android device** (installable PWA, full-bleed on phones, centered on desktop)
and wraps into true native App Store / Play Store builds as the next step (see
`ROADMAP.md`). All UI uses **custom SVG icons** (no emoji). It runs **with zero API
keys** for a reliable live demo, and upgrades to the real Claude brain + live data
when you add keys.

---

## 1. Run it in 60 seconds (for the investor demo)

```bash
cd Crime_AI
npm install          # one time
npm run seed         # one time — generates the Miami dataset (already done)
npm run dev          # starts the app at http://localhost:3000
```

Open **http://localhost:3000** in a browser. On desktop it renders inside a **phone
frame** so it looks like a real device. To demo on an actual phone, see §4.

That's it. No keys needed — the app uses a built-in Miami dataset, free map tiles,
and a grounded fallback for the CrimeAI brain so **nothing can fail live on stage.**

> First run compiles on demand; give the first screen a couple of seconds.

---

## 2. The flow an investor will see

1. **Sign up / Log in** — a real account (email + password).
2. **Required onboarding** — full profile setup: name + **profile photo**, then home
   **address or "Use my location"** with an **alert-radius slider**, then **alert types
   + notification channels**. (Everything needed is collected up front.)
3. **Bottom navigation — 5 tabs, in order: Feed · Map · Ask · Inbox · You** (Feed is home):
   - **Feed** — a **TikTok/Instagram-style social feed** with top tabs **For You ·
     Local · News · Trending** and **video reels, threads, image posts, crime reports,
     and trending local news**. Reels use a full-bleed vertical card with a TikTok-style
     action rail. All icons are **custom SVG** (no emoji); avatars are colored initials.
     Like, save, follow, **comment** (comment sheet), and **share** (native share) all work.
   - **Map** — live incidents **+ community reports** as pins, radius ring, filters,
     heatmap, source/confidence/corroboration; a **＋ Report** FAB drops a pin.
   - **Ask** — a full conversation with **CrimeAI**, grounded in real incidents around
     the address. Try *"Is it safe to walk here at night?"*
   - **Inbox** — unified **alerts + social notifications + system messages**.
   - **You** — an Instagram-style **profile**: avatar, stats (Posts / Following / Likes),
     and tabs for **Posts** (your own feed), **Saved**, and **Safety** (score, breakdown,
     time-of-day, coverage). A **Settings** screen (gear icon) holds account/photo,
     location & radius, alerts, trusted circle, privacy guardrails, and sign out.
4. **＋ Create** (Feed header & Map FAB) — a multi-format composer: **Post (image),
   Reel (video), Thread, or Report**. Reports post to the **Feed** *and* drop a **pin
   on the Map**; uploads accept image or video.
5. **SOS** — a header pill on the Feed and a floating button elsewhere — *I'm not safe*
   and *Walk-with-me*, always one tap away.

Good demo addresses: **Brickell**, **Wynwood** (hot), **Coral Gables**, **Key Biscayne** (calm), **33139**.

---

## 3. Turning on the "real" brain and data (optional, recommended for a polished demo)

Copy `.env.example` to `.env.local` and fill in whatever you have. **Restart the dev
server after changing env.** Everything is optional — the app degrades gracefully.

| What | Variable | Effect |
|---|---|---|
| **Claude brain (best)** | `ANTHROPIC_API_KEY` | CrimeAI answers via Claude (`claude-opus-4-8`). Most impressive, most reliable. |
| Model override | `CRIMEAI_MODEL` | Defaults to `claude-opus-4-8`. |
| **Your local model** | `OLLAMA_URL`, `OLLAMA_MODEL` | If no Anthropic key, the app uses your existing `torr-crimeai` model via Ollama. |
| Full address coverage | `MAPBOX_TOKEN` | Resolves any street address (free fallback covers neighborhoods + ZIPs). |
| Live data | `USE_LIVE_DATA=true` | Reserved for the Miami-Dade live adapter (see ROADMAP Phase 2). |

**Engine priority:** Anthropic → Ollama → built-in grounded fallback. The chat shows
which engine answered (`Claude` / `torr-crimeai` / `grounded`).

### Real backend — posts, follows, comments & profiles sync across devices (Supabase)

The social layer (posts, reels, threads, reports, likes, saves, follows, comments,
profiles) runs on **Supabase** when configured, so real users see each other's content
across phones. Without it, the app falls back to localStorage automatically.

1. Create a free project at **supabase.com**.
2. **SQL Editor** → paste & run [`supabase/schema.sql`](supabase/schema.sql) (tables,
   row-level security, counter triggers, auto-profile-on-signup, a public `media`
   storage bucket), then [`supabase/seed.sql`](supabase/seed.sql) (shared demo
   community + news content).
3. **Authentication → Providers → Email** → turn **off** "Confirm email" for a
   frictionless beta (users can log in immediately after signup).
4. **Project Settings → API** → copy the **Project URL** and **anon/public key** into
   `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOURPROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
5. Restart `npm run dev`. Now sign-ups create real accounts, posts/comments/follows
   write to Postgres (secured by RLS), media uploads go to Supabase Storage, and
   **everything syncs across devices and users**. Open the app on two devices, post on
   one, see it on the other.

Security: RLS lets anyone read public posts/profiles but only write their own rows;
media bucket is public-read, authenticated-write; uploaded files are namespaced per
user. See the policies in `schema.sql`.

To use your existing CrimeAI model locally:
```bash
ollama serve                 # if not already running
ollama pull torr-crimeai     # or your model name; set OLLAMA_MODEL to match
```

---

## 4. Demo on a real iPhone / Android phone (same Wi-Fi)

```bash
npm run dev
# find your computer's LAN IP, e.g. 192.168.1.50
```
On the phone's browser open `http://<your-ip>:3000`. Then **Add to Home Screen** —
it installs as a full-screen app named **CrimeAI** with its own icon (PWA). This is
the fastest way to show "it's a real mobile app" without an app-store build.

---

## 5. Production deploy (when you're past the laptop)

The fastest path is **Vercel** (zero-config for Next.js):
```bash
npm i -g vercel && vercel        # follow prompts; add env vars in the dashboard
```
Or any Linux VPS (roadmap §11): `npm run build && npm run start` behind Nginx +
Cloudflare. Swap the seed dataset for Postgres + PostGIS and the live ingestor when
you move past the demo (see `ROADMAP.md`).

---

## 6. What's real vs. demo-stubbed (be honest with investors)

**Real & working now**
- Mobile app UX, auth, **required onboarding** (photo, location/radius, alert prefs),
  conversation-first CrimeAI, the **social Feed** (posts + reports + news + connect),
  image/video **reporting** that hits the feed and the map, **Inbox**, map, safety
  scoring, coverage matrix, SOS/walk-with-me flows.
- CrimeAI answers are **genuinely grounded** in the incident data for the chosen address
  (counts, categories, time-of-day, trend, sources) — not canned.
- Real Claude or your local torr-crimeai brain when keys/Ollama are present.
- The social layer is **seeded** (realistic Miami neighbors + headlines) so the feed
  feels alive instantly; your own posts/reports/follows/likes persist locally.

**Real backend (optional, one-time setup)**
- **Auth, posts, follows, comments, likes, saves, profiles, media**: real and
  multi-user **when Supabase is configured** (see §3). Falls back to localStorage with
  zero config for demos. Same code path either way.

**Demo-stubbed (clearly flagged, swap-in path in ROADMAP)**
- **Crime incident data**: a realistic, Miami-accurate seeded dataset (real
  neighborhoods, plausible crime mixes) served by `/api/incidents`. Live Miami-Dade
  ingestion is Phase 2.
- **Notifications & SOS delivery**: UX is complete; wiring push/SMS (FCM/APNs/Twilio)
  is Phase 3.

---

## 7. Project map

```
app/                  Next.js app router
  page.tsx            Auth → Onboarding → App state machine (mobile shell)
  api/crimeai/lookup  address → location + safety stats + recent incidents
  api/crimeai/ask     question → grounded CrimeAI answer
  api/incidents       map/feed incidents (radius, days, filters)
components/
  AppShell, BottomNav, SOS, Logo
  auth/               AuthScreen, Onboarding
  screens/            AskScreen (home), MapScreen, AlertsScreen, SafetyScreen, MeScreen
  Map, SafetyScore, Breakdown, CoverageMatrix, IncidentFeed
lib/
  auth.ts             accounts + profile (swap for Clerk/Supabase)
  crimeai.ts          CrimeAI identity + Anthropic/Ollama/fallback brain
  data.ts             geo queries, safety score, trends, comparisons
  geocode.ts          Miami gazetteer + Nominatim/Mapbox
data/                 seeded Miami dataset (npm run seed regenerates)
scripts/generate-data.mjs
ROADMAP.md            what to build next + how this beats Citizen
```

Built by Billy Torres · BlackSeed Labs / TORR AI · Miami beta · Confidential.
*Informational only. In an emergency, call 911.*
