# Apple / Push Setup — Billy's checklist

Status as of 2026-08-05. Everything marked **you** is account work I cannot do.

---

## 1. Sign in with Apple — ✅ WORKING (one gap)

Key `5YH697B4BL` ("CrimeAI SIWA") is correct and live:
- Supabase Apple provider **enabled**, verified redirecting to `appleid.apple.com`
- Services ID `com.pscc.crimeai.web` · app bundle ID `com.pscc.crimeai`

**Gap now fixed in code:** `ios/App/App/App.entitlements` did not exist, so the
*Sign in with Apple* capability wasn't on the native app. Apple requires native
SIWA when you also offer Google sign-in — a likely review rejection.

**You, in Xcode (one time):**
1. Open `ios/App/App.xcworkspace`
2. Select the **App** target → **Signing & Capabilities**
3. Confirm **Sign in with Apple** and **Push Notifications** appear (the new
   entitlements file adds them; if Xcode doesn't pick them up, click
   **+ Capability** and add each once — Xcode will link the file)
4. Make sure the entitlements file is set under Build Settings →
   *Code Signing Entitlements* → `App/App.entitlements`

---

## 2. APNs key (push, iOS) — ❌ you need to create this

Your SIWA key **cannot** do push (your Keys screen shows APNS Config `-`).

**You, in Apple Developer → Certificates, IDs & Profiles → Keys:**
1. **+** → name it e.g. `CrimeAI APNs`
2. Tick **Apple Push Notifications service (APNs)** → Continue → Register
3. **Download the `.p8` — you only get one chance.** Store it in a password manager.
4. Note the **Key ID** (10 chars) and your **Team ID** (top-right of the portal)

**Then in Vercel → Environment Variables:**
| Variable | Value |
|---|---|
| `APNS_KEY_P8` | the whole `.p8` contents (paste with real newlines, or `\n`-escaped — both supported) |
| `APNS_KEY_ID` | the new key's Key ID |
| `APNS_TEAM_ID` | your Apple Team ID |
| `APNS_BUNDLE_ID` | `com.pscc.crimeai` |

Push goes live the moment those exist — no deploy of mine required beyond a redeploy.

⚠️ **Never commit the `.p8`.** `.gitignore` already covers `*.p8`.

---

## 3. FCM (push, Android) — ❌ you need to create this

**You, in Firebase:**
1. Create a project (or reuse one) → add an **Android app** with package
   `com.pscc.crimeai`
2. Download `google-services.json` → place at `android/app/google-services.json`
3. Project Settings → **Service accounts** → **Generate new private key** (JSON)

**Then in Vercel:** `FCM_SERVICE_ACCOUNT_JSON` = the entire service-account JSON,
as one line.

---

## 4. App Store Connect API key — ❌ optional, for automated builds

This is a **different key type in a different place** from your SIWA key.

**You, in App Store Connect → Users and Access → Integrations → App Store Connect API:**
1. **+** → name e.g. `CrimeAI CI` → Access role **App Manager** (Developer is
   enough for uploads only)
2. **Download the `.p8` — once only.** Note the **Key ID** and the **Issuer ID**
   (shown above the key list)

**What it's for:** uploading builds to TestFlight from CI, managing metadata and
testers via API. **You do not need it to ship** — Xcode can upload directly.
Set it up when you want automated deploys; store the three values
(`.p8`, Key ID, Issuer ID) in your password manager or CI secrets.

---

## 5. Activate the notification triggers — ❗ 2 minutes, do this first

The database now fires a real-time HTTP call whenever something notifiable
happens (comment, like, DM, nearby report, follow, corroboration, news).
It is currently **silent** because the endpoint and secret are unset.

**a) Pick a secret and add it in Vercel:**
| Variable | Value |
|---|---|
| `PUSH_EVENT_SECRET` | any long random string you choose |

**b) Tell the database where to send events** — run this once against your
Supabase project (SQL editor), pasting the *same* secret:

```sql
insert into public.app_settings (key, value) values
  ('push_endpoint', 'https://app.publicsafetycrimecenter.com/api/push/event'),
  ('push_secret',   'PASTE_THE_SAME_SECRET_HERE')
on conflict (key) do update set value = excluded.value;
```

Until APNs/FCM keys exist the events will resolve recipients and log, but
send nothing — which is exactly the intended dormant state.

## What is built and waiting

| Piece | State |
|---|---|
| `device_tokens` + `push_deliveries` tables | applied to the live DB |
| APNs sender (ES256 JWT, no SDK) | built, **dormant** until `APNS_*` vars exist |
| FCM sender (service-account OAuth) | built, **dormant** until `FCM_*` exists |
| Fan-out: preferences, dedupe, dead-token cleanup | built + tested |
| `POST /api/push/register` | live |
| Native registration helper | built (loads the plugin only on device) |
| iOS entitlements (SIWA + push) | committed |

**Safety behaviour:** notifications of `kind: "safety"` deliberately **bypass**
the user's push preference — a Trusted-Circle emergency must reach the device
even if routine alerts are muted. Routine `alert` notifications respect it.

**Not wired yet:** nothing calls `sendPush()`. Deciding *what* triggers a push
(new critical incident within radius, Trusted-Circle SOS, corroboration of your
report) is the next piece of work — the plumbing is ready for it.
