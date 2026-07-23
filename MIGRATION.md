# CrimeAI / PSCC — Database Migration Plan
## Supabase → BlackSeed 7 / Torr AI Servers

**Owner:** BlackSeed Labs / TORR AI · **App:** CrimeAI (Public Safety Crime Center)
**Current backend:** Supabase Cloud, project `bxxxgeehipamftusegmx`, region `us-east-1` (N. Virginia)
**Last updated:** July 2026

---

## 1. What we run today (and why it migrates cleanly)

Supabase is not a proprietary platform — it is **open-source infrastructure around plain PostgreSQL**:

| Layer | What Supabase runs | Portable? |
|---|---|---|
| Database | PostgreSQL 15 | ✅ 100% — plain SQL, `pg_dump` restores anywhere |
| Auth | GoTrue (open source) | ✅ bcrypt password hashes move as-is |
| File storage | S3-compatible storage API | ✅ any S3/MinIO target |
| API layer | PostgREST (auto REST over Postgres) | ✅ self-hostable, or replaced by our own API |
| Realtime | Postgres logical replication | ✅ self-hostable |

The **entire schema is in this repo** and is the source of truth:

- [`supabase/schema.sql`](supabase/schema.sql) — tables (`profiles`, `posts`, `likes`, `saves`, `follows`, `comments`, `messages`), row-level-security policies, counter triggers, auto-profile-on-signup trigger, `media` storage bucket
- [`supabase/seed.sql`](supabase/seed.sql) — community seed content
- [`supabase/personas.sql`](supabase/personas.sql) — turns the 7 community accounts into real, login-able users with a real follow graph and real like/comment rows (no mock numbers anywhere)

**The app only touches the backend through 4 files** — this is the migration seam:

```
lib/supabase.ts   ← client + row mappers (the ONLY file that imports supabase-js)
lib/auth.ts       ← signup/login/verify/reset/SSO
lib/social.ts     ← feed, posts, likes, saves, follows, comments, stats
lib/messages.ts   ← neighbor DMs
```

Every screen calls functions like `getFeed()`, `toggleFollow()`, `verifySignup()` — no screen knows what backend exists. Swapping backends = touching those 4 files, nothing else.

---

## 2. Migration Path A — Self-host Supabase on BlackSeed 7 (recommended first)

**Zero app-code changes. A weekend of ops work. Full data sovereignty.**

### 2.1 Provision the box
- Ubuntu 22.04+ (or any Docker host), 8+ GB RAM to start, SSD
- Docker + Docker Compose
- A subdomain, e.g. `api.publicsafetycrimecenter.com`, pointed at the server
- TLS via Caddy/Traefik/nginx + Let's Encrypt

### 2.2 Stand up the stack
```bash
git clone https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# In .env set: POSTGRES_PASSWORD, JWT_SECRET (32+ chars), ANON_KEY,
# SERVICE_ROLE_KEY (generate from JWT_SECRET at supabase.com/docs/guides/self-hosting),
# SITE_URL=https://app.publicsafetycrimecenter.com, SMTP_* (Resend/Postmark creds)
docker compose up -d
```

### 2.3 Move the database (minutes of downtime, or zero with replication)
```bash
# 1) Dump from Supabase Cloud (use the session pooler, port 5432)
pg_dump "postgresql://postgres.bxxxgeehipamftusegmx:<DB_PASSWORD>@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  --clean --if-exists \
  --schema=public --schema=auth --schema=storage \
  -f crimeai_full.sql

# 2) Restore into BlackSeed 7
psql "postgresql://postgres:<NEW_PASSWORD>@api.publicsafetycrimecenter.com:5432/postgres" -f crimeai_full.sql
```
- **Users keep their passwords** — bcrypt hashes live in `auth.users.encrypted_password` and restore verbatim.
- For zero-downtime instead: set up Postgres logical replication from cloud → BlackSeed, let it sync, then cut over DNS.

### 2.4 Move file storage (user photos, post media, live-stream replays)
```bash
# S3-compatible on both ends — rclone does it in one line
rclone sync supabase-cloud:media blackseed-minio:media
```
(Or keep using the `storage-api` container from the self-hosted stack — the dump in 2.3 already carries bucket metadata.)

### 2.5 Cut the app over
`.env.local` (dev) / hosting env (prod) — change two lines:
```
NEXT_PUBLIC_SUPABASE_URL=https://api.publicsafetycrimecenter.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<self-hosted anon key>
```
Ship. Users notice nothing. Sessions re-authenticate transparently on next login.

### 2.6 Rollback plan
Keep the Supabase Cloud project paused (not deleted) for 30 days. Rollback = revert the two env lines.

---

## 3. Migration Path B — Native BlackSeed/Torr API (the endgame)

When Torr AI should sit *inside* the request path (ranking, alerting, moderation), replace PostgREST with a first-party API in front of the same Postgres.

### 3.1 Architecture
```
 iOS / Android / Web (CrimeAI app)
        │  HTTPS + JWT
        ▼
 BlackSeed API  (Node/Fastify or Go — api.publicsafetycrimecenter.com)
        │            │
        ▼            ▼
 PostgreSQL      TORR AI  (GPU box — Ollama `torr-crimeai` + embeddings)
 (from Path A)       │
        ▼            ▼
 MinIO (media)   Redis (feed cache, alert fanout queues)
```

### 3.2 Replace in this order (lowest risk first)
1. **Database** — already yours after Path A. Nothing to do.
2. **Storage** — point uploads at MinIO presigned URLs (change `uploadMedia` in `lib/supabase.ts`).
3. **Reads** — new API endpoints for `getFeed`, `postsByHandle`, `getUserStats`; swap the Supabase queries in `lib/social.ts` for `fetch()` calls. RLS policies become API middleware checks (same rules, expressed in code).
4. **Writes** — `addPost`, `toggleLike/Save/Follow`, `addComment`, `sendDM`.
5. **Auth last** — issue your own JWTs from the same `auth.users` table (hashes are standard bcrypt — `bcrypt.compare()` just works). Signup verification + password-reset codes move to your API + Resend/Twilio. Google/Apple SSO become direct OAuth flows.

Each step is independently shippable and independently revertible.

---

## 4. Torr AI ⇄ CrimeAI integration ("Torr is God over CrimeAI")

Torr AI is **already wired** as an engine: `lib/crimeai.ts` tries **Anthropic → Ollama model `torr-crimeai` → grounded fallback**. On BlackSeed hardware, Torr becomes primary and expands from chat engine to platform brain:

| Capability | How it connects |
|---|---|
| **Conversation (Ask tab)** | `OLLAMA_URL=http://torr-gpu:11434`, `CRIMEAI_ENGINE=torr` — Torr answers with direct SQL access to incidents/posts for cited, hyper-local replies |
| **Feed ranking** | Nightly + streaming job: Torr scores every post (relevance × proximity × engagement × urgency) → writes `posts.rank_score` → `getFeed()` orders by it (replaces client-side `rankForYou`) |
| **Alert brain** | Torr consumes the incident stream (Postgres `LISTEN/NOTIFY` or Redis queue), decides who to notify within their radius/categories/severity prefs, dispatches push (APNs/FCM), SMS (Twilio), email (Resend) |
| **Report verification** | New community report → Torr cross-references official incident data + nearby reports → sets `verified` flag with confidence score |
| **Moderation** | Every post/media upload passes a Torr policy check (guardrails: no faces/plates published, no doxxing, no vigilante coordination) before going live |
| **Safety scores** | Torr recomputes neighborhood safety scores hourly from live data instead of static seeds |

**Guardrails carry over as system policy** (already enforced in the CrimeAI prompt): no facial recognition, no race/ethnicity descriptors, no predictive policing of individuals, lawful public data only, "call 911" for emergencies.

### Suggested Torr service layout on BlackSeed 7
```
torr-gateway   — REST/gRPC in front of Ollama; auth between API ⇄ Torr
torr-ranker    — feed scoring worker (queue consumer)
torr-alerts    — alert decision + dispatch worker
torr-moderate  — synchronous pre-publish checks (<300ms budget)
```

---

## 5. Cutover checklist

- [ ] BlackSeed 7 provisioned (Docker, TLS, backups, monitoring)
- [ ] Self-hosted stack up; `schema.sql` applies clean on fresh Postgres
- [ ] `pg_dump`/restore rehearsed on a staging copy; row counts verified
- [ ] Media synced (rclone) and URLs resolving
- [ ] DNS: `api.publicsafetycrimecenter.com` → BlackSeed 7
- [ ] App env flipped; login + post + like + comment + DM smoke-tested
- [ ] SMTP (Resend/Postmark @ publicsafetycrimecenter.com) + Twilio pointed at new stack
- [ ] Torr AI reachable from API host; `CRIMEAI_ENGINE` order set
- [ ] Old Supabase project paused for 30-day rollback window, then deleted
- [ ] **Rotate all credentials** (DB password, JWT secret, persona test passwords)

---

## 6. Current production accounts (beta test roster)

All 7 community accounts are **real users** (real auth records, bcrypt passwords, real posts/likes/comments/followers — zero mock numbers). Created by [`supabase/personas.sql`](supabase/personas.sql).

**Shared test password: `PSCC-Beta2026!`**

| Name | Handle | Login email | Neighborhood |
|---|---|---|---|
| Brickell Watch | @brickellwatch | brickellwatch@crimeai.app | Brickell |
| Carlos M. | @carlos_mia | carlos.m@crimeai.app | Little Havana |
| Wynwood Pulse | @wynwoodpulse | wynwoodpulse@crimeai.app | Wynwood |
| Aisha R. | @aisha305 | aisha.r@crimeai.app | Edgewater |
| SoBe Neighbors | @sobeneighbors | sobeneighbors@crimeai.app | South Beach |
| Dwayne K. | @dwaynek | dwayne.k@crimeai.app | Coconut Grove |
| Gables Alert | @gablesalert | gablesalert@crimeai.app | Coral Gables |

> ⚠️ Rotate this shared password before public beta (Supabase dashboard → Authentication → Users, or `update auth.users set encrypted_password = crypt('<new>', gen_salt('bf')) where email = '...'`).
