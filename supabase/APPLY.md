# Applying migrations

There is no migration runner — every `.sql` file here is applied by hand,
which means a new file is silently *not* applied until someone remembers.
That is how ID verification shipped against a database with no
`biometric_consents` table, and why "Start verification" failed with nothing
useful to say.

**When you add a `.sql` file, add it to this list in the same commit.**

## Two ways to apply — don't mix them up

**A. Supabase SQL Editor** (no setup). It accepts **SQL only** — a shell
command pasted in returns `42601: syntax error at or near "psql"`. You need
the *contents* of the file. On a Mac, put them on the clipboard:

```bash
cat supabase/verification.sql | pbcopy
```

then paste into the editor and press **Run**.

**B. Terminal** (needs `psql` and a connection string — Supabase → Settings →
Database → Connection string). This is a **shell** command, not something to
paste into the SQL Editor:

```bash
psql "$DATABASE_URL" -f supabase/verification.sql
```

Every file is written to be **idempotent** (`create table if not exists`,
`create or replace function`), so re-running one is safe. If in doubt, run it.

---

## Order

Dependencies run downward — later files reference earlier ones. Within a
group, order does not matter.

### 1. Foundation — required
| File | What it creates |
|---|---|
| `schema.sql` | profiles, posts, follows, comments, storage bucket, RLS |
| `seed.sql` | demo content |
| `personas.sql` | demo personas |
| `handles.sql` | @handle uniqueness |
| `admin.sql` · `admin-team.sql` | Command Center accounts + roles |

### 2. Product surfaces
| File | What it creates |
|---|---|
| `privacy.sql` | `profiles.is_private` + follow-request semantics |
| `edit-profile.sql` · `reposts.sql` · `sos.sql` | profile editing, reposts, SOS |
| `legal.sql` · `legal-seed.sql` | ToS/Privacy documents + per-version acceptance |
| `sources.sql` | ingestion sources |
| `features.sql` | feature flags |
| `live-ambassadors.sql` | LIVE applications |
| `store-compliance.sql` | store review requirements |

### 3. Payments
| File | What it creates |
|---|---|
| `billing.sql` · `billing-subscriptions.sql` | subscription state |
| `tiers.sql` · `tier-admin.sql` | plans, prices, limits |
| `authnet.sql` | Authorize.Net nonces + checkout |
| `webhooks.sql` | webhook dedupe (`claim_webhook_event`) |
| `badge.sql` · `badge-pref.sql` | Protector badge projection + user toggle |

### 4. Scoring & identity
| File | What it creates |
|---|---|
| `scoring.sql` · `scoring-phase5.sql` | NSS, area scores, config |
| `block-strength.sql` | Block Strength |
| `guardian.sql` | Guardian Score, Watch Points ledger |
| `identity.sql` | `identity_status` levels 0–4, velocity counters |

### 5. Notifications
| File | What it creates |
|---|---|
| `push.sql` | `device_tokens`, `push_deliveries` |
| `push-triggers.sql` | `pg_net` + AFTER-INSERT triggers |

### 6. Most recent — **check these are applied**

Added late; the likeliest to be missing on any given environment.

| File | What it creates | Follow-up |
|---|---|---|
| `official-account.sql` | `is_official`, `suggested_follows()`, `designate_official()` | then run `select public.designate_official('crimeai@publicsafetycrimecenter.com','crimeai');` after creating the auth user in the dashboard |
| `verification.sql` | `biometric_consents`, `identity_verifications`, `decide_verification()`, `is_identity_verified()`, 24h media purge | none |
| `account-exists.sql` | `account_exists(email)` — signup redirects existing users to password login (deliberate, documented enumeration trade-off) | none |
| `ai-config.sql` | CrimeAI assistant config (model, system prompt, temperature, per-tier limits) — managed in Command Center → Assistant | none |
| `ai-voice-web-limits.sql` | Protector voice + web meters (ai_voice/ai_web: free 0, pro 200/100) | none |
| `ai-vision-limits.sql` | Protector image-analysis meter (ai_vision: free 0, pro 100) | none |
| `ai-memory.sql` | CrimeAI durable user memory (crimeai_user_memory) — remembers facts across chats, own-row RLS, 50-cap, blocklist | none |
| `ai-threads.sql` | CrimeAI conversation threads (ai_threads + ai_messages) — persistence for the chat, multi-thread drawer for Protectors | none |
| `notifications.sql` | in-app Activity feed: `notifications` table + triggers on likes/comments/follows/corroborations/tier changes, `mark_notifications_read()`, `unread_notification_count()` | none |
| `sources-tricounty.sql` | registers NWS alert feeds for Miami-Dade/Broward/Palm Beach (enabled) + Miami-Dade jail bookings | none |
| `pricing-plans.sql` | plan display fields (tagline/blurb/features/status), Guardian + Community as coming-soon, **$69.99 annual Protector price**, retires the $4.99 arm | none |

---

## Checking what is actually applied

```sql
select table_name from information_schema.tables
 where table_schema = 'public' order by table_name;
```

Tables that should exist once everything above has run include
`biometric_consents`, `identity_verifications`, `device_tokens`,
`push_deliveries`, `guardian_scores`, `block_strength`, `area_scores`,
`identity_status`, `tier_plans`, `legal_documents`.

```sql
-- and the functions the app calls by name
select proname from pg_proc
 where proname in ('suggested_follows','is_identity_verified','decide_verification',
                   'designate_official','claim_webhook_event','purge_expired_verification_media');
```

A missing table surfaces in the app as a generic failure, so check here first
when a feature "just doesn't work" on one environment but not another.

- `post-owner-edit.sql` — lets a user edit/delete their OWN posts (owner RLS on public.posts). Required for the post ⋮ Edit/Delete menu.
