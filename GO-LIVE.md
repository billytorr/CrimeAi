# CrimeAI — Go-Live Checklist

Run this **one pass** and the whole app works end to end. Four parts:
1. Database — apply migrations, then a paste-once self-check
2. Environment variables — what must be set in Vercel
3. One-time setup actions
4. TestFlight device test script

Nothing here is optional hand-waving — each item is something that has
actually bitten this build.

---

## 1. Database migrations

Apply in the Supabase **SQL Editor** (copy file contents, paste, Run). Every
file is idempotent — safe to re-run. Full ordered list + descriptions live in
[supabase/APPLY.md](supabase/APPLY.md). The ones most likely still missing:

```bash
# copy each, paste into SQL Editor, Run:
cat "/Volumes/BlackSeed SSD/Projects/CrimeAI"/supabase/ai-config.sql | pbcopy
cat "/Volumes/BlackSeed SSD/Projects/CrimeAI"/supabase/ai-threads.sql | pbcopy
cat "/Volumes/BlackSeed SSD/Projects/CrimeAI"/supabase/ai-vision-limits.sql | pbcopy
cat "/Volumes/BlackSeed SSD/Projects/CrimeAI"/supabase/ai-voice-web-limits.sql | pbcopy
cat "/Volumes/BlackSeed SSD/Projects/CrimeAI"/supabase/ai-memory.sql | pbcopy
cat "/Volumes/BlackSeed SSD/Projects/CrimeAI"/supabase/notifications.sql | pbcopy
cat "/Volumes/BlackSeed SSD/Projects/CrimeAI"/supabase/verification.sql | pbcopy
cat "/Volumes/BlackSeed SSD/Projects/CrimeAI"/supabase/official-account.sql | pbcopy
cat "/Volumes/BlackSeed SSD/Projects/CrimeAI"/supabase/account-exists.sql | pbcopy
cat "/Volumes/BlackSeed SSD/Projects/CrimeAI"/supabase/sources-tricounty.sql | pbcopy
cat "/Volumes/BlackSeed SSD/Projects/CrimeAI"/supabase/pricing-plans.sql | pbcopy
```

### Paste-once self-check

Run this in the SQL Editor. Every row should read **OK**. Any **MISSING** is
the file to apply.

```sql
with expect(kind, name, file) as (values
  ('table','ai_config','ai-config.sql'),
  ('table','ai_threads','ai-threads.sql'),
  ('table','ai_messages','ai-threads.sql'),
  ('table','crimeai_user_memory','ai-memory.sql'),
  ('table','notifications','notifications.sql'),
  ('table','identity_verifications','verification.sql'),
  ('table','biometric_consents','verification.sql'),
  ('table','tier_plans','pricing-plans.sql (+tiers.sql)'),
  ('function','account_exists','account-exists.sql'),
  ('function','suggested_follows','official-account.sql'),
  ('function','is_identity_verified','verification.sql'),
  ('function','unread_notification_count','notifications.sql'),
  ('function','mark_notifications_read','notifications.sql')
)
select e.name,
       case when e.kind='table'
            then coalesce((select 'OK' from information_schema.tables t
                           where t.table_schema='public' and t.table_name=e.name), 'MISSING → '||e.file)
            else coalesce((select 'OK' from pg_proc where proname=e.name limit 1), 'MISSING → '||e.file)
       end as status
from expect e order by status desc, e.name;
```

### The Protector-gating rows (the "it wouldn't let me" bug)

These `tier_limits` rows are what let a Protector use AI, voice, vision, web.
Run this — Free should be 0/5, Pro should be non-zero:

```sql
select capability, plan_id, value from public.tier_limits
 where capability in ('ai_analytical','ai_vision','ai_voice','ai_web')
 order by capability, plan_id;
```

Expected: `ai_analytical` free 5 / pro 150 · `ai_vision` 0/100 · `ai_voice`
0/200 · `ai_web` 0/100. Missing pro rows → apply `ai-vision-limits.sql` +
`ai-voice-web-limits.sql`.

---

## 2. Environment variables (Vercel → all three environments, then redeploy)

### Required — the app is broken without these
| Var | Why |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client DB/auth |
| `SUPABASE_SERVICE_ROLE_KEY` | server routes; without it every `/api/me/*` 500s |
| `ANTHROPIC_API_KEY` | **the chatbot** — without it CrimeAI falls back to canned answers |
| `CHECKOUT_TOKEN_SECRET` | signs checkout tokens |
| `AUTHNET_ENV` · `AUTHNET_API_LOGIN_ID` · `AUTHNET_TRANSACTION_KEY` · `AUTHNET_SIGNATURE_KEY` · `NEXT_PUBLIC_AUTHNET_CLIENT_KEY` | payments |
| `PUSH_EVENT_SECRET` | push triggers (+ the matching `app_settings` rows) |

### AI capabilities — set to light up each Protector feature
| Var | Unlocks |
|---|---|
| `DEEPGRAM_API_KEY` + `CRIMEAI_STT_PROVIDER=deepgram` | voice in |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` + `CRIMEAI_TTS_PROVIDER=elevenlabs` | voice out |
| `BRAVE_API_KEY` + `CRIMEAI_SEARCH_PROVIDER=brave` | web search |
| `TAVILY_API_KEY` + `CRIMEAI_RESEARCH_PROVIDER=tavily` | web research |
| (vision uses `ANTHROPIC_API_KEY` — no separate key) | image analysis |

### Push (iOS + Android)
`APNS_KEY_P8` · `APNS_KEY_ID` · `APNS_TEAM_ID` · `APNS_BUNDLE_ID` ·
`FCM_SERVICE_ACCOUNT_JSON`

### ⚠️ Rotate before launch — appeared in chat/screenshots, treat as compromised
- The production **Authorize.Net** keys
- `PUSH_EVENT_SECRET`
- The APNs `.p8` (`6UA7W3YC7X`)

Verify env is live: `GET /api/crimeai/capabilities` — every provider you keyed
should read `configured: true`.

---

## 3. One-time setup actions

- [ ] **@crimeai account** — Supabase → Auth → Add user (`tech@blackseed.io`,
      auto-confirm), then SQL: `select public.designate_official('tech@blackseed.io','crimeai');`
- [ ] **App Review account** — reset `reviewer@crimeai.app`'s password
      (`update auth.users set encrypted_password=crypt('NEW',gen_salt('bf')) where email='reviewer@crimeai.app';`),
      confirm it signs in, is onboarded in Brickell, `is_private=false`.
- [ ] **Push triggers** — insert `push_endpoint` + `push_secret` rows into
      `app_settings` (APPLE-SETUP.md §5), same secret as `PUSH_EVENT_SECRET`.
- [ ] **Publish Privacy Policy v2** to the `legal_documents` table (the app
      ships only a fallback; reviewers read the live one).

---

## 4. TestFlight device test script

Build → Archive → upload → install via TestFlight on a **real iPhone**
(Simulator can't do push or real APNs). Then walk this:

| # | Test | Pass = |
|---|---|---|
| 1 | Open the app, sign in | lands in the feed with content |
| 2 | Onboarding location "Use my location" (fresh account) | shows your **actual city** (e.g. Fort Lauderdale), not "Miami" |
| 3 | Tap CrimeAI, say "hi" | warm reply that **asks about you** — NOT a stats dump |
| 4 | Ask "is my block safe tonight?" | grounded answer using real data |
| 5 | Refresh/reopen the app | the conversation is **still there** (needs ai-threads.sql) |
| 6 | Inbox → Activity | shows likes/follows once another account interacts |
| 7 | Accept the notifications prompt, then `select platform,environment from device_tokens order by created_at desc limit 3;` | a row appears |
| 8 | Settings → App lock → background & reopen | Face ID unlock; SOS reachable from the lock screen |
| 9 | Voice: tap the shield (right of Send), speak | it transcribes, answers, **speaks back**, shield pulses; on Done the convo is in text |
| 10 | Paperclip → share a photo | CrimeAI describes it |
| 11 | Settings → Compare plans → Annual → Subscribe | opens **Safari**, header reads **$69.99/yr**, one charge in Authorize.Net |
| 12 | Settings → "What CrimeAI remembers" | lists remembered facts, Forget works |

**Sign-out check:** sign out on the phone → the web session on another device
stays signed in (device-local scope).

---

## Decisions still yours (not blockers to test, but before public launch)

- **IDV vendor** — biometric verification can't go live without one (DATA-GOVERNANCE.md)
- **Counsel review** of DATA-GOVERNANCE.md (BIPA) before any biometric capture
- **ElevenLabs cost** — watch a week of real usage; a heavy user's 200 voice
  min could exceed $7.99. Deepgram TTS is the cheaper swap.
- **US-storefront only** for v1.0 — the external-purchase link is permitted in
  the US post-*Epic*, likely rejected elsewhere (FOUNDERS.md)
- **Self-serve cancel** — currently email-us; a compliance issue in some states
