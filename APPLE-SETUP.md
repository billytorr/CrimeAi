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

## 3. FCM (push, Android) — ⚠️ app side DONE, one step left

**Done:**
- Firebase project `crimeai-app`, Android app package `com.pscc.crimeai` ✅
- `android/app/google-services.json` in place, package verified matching ✅
- Gradle wiring ✅ — **no manual editing was needed.** Capacitor already ships
  `classpath 'com.google.gms:google-services:4.4.4'` in `android/build.gradle`
  and a conditional `apply plugin: 'com.google.gms.google-services'` in
  `android/app/build.gradle` that switches itself on the moment
  `google-services.json` exists. **Ignore the Gradle snippets the Firebase
  console shows** — it defaults to the Kotlin-DSL (`build.gradle.kts`) tab and
  this project uses Groovy `build.gradle`; pasting them would break the build.
- `@capacitor/push-notifications` registered in the native Android + iOS
  projects (`npx cap update`) ✅

**Left for you — Firebase Console → ⚙️ Project settings → Service accounts:**
1. **Generate new private key** → a JSON file downloads
2. **Vercel → Environment Variables:** `FCM_SERVICE_ACCOUNT_JSON` = the entire
   JSON file contents, pasted as one value (keep the `\n` inside `private_key`
   exactly as they are — do not "fix" them)
3. Redeploy

That service-account key is what lets the *server* send. `google-services.json`
only lets the *app* receive — the two are different halves.

⚠️ The service-account JSON is a **secret** — never commit it, never paste it in
chat. `google-services.json` is client config and is safe in the repo.

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

## 6. How to test it works

### Level 1 — prove the credentials, no device needed ⭐ do this first

`GET /api/push/diagnose` sends to a deliberately fake device token and reads
which error comes back. Reaching a *token* rejection means auth already
succeeded — so the failure we want is a token failure.

```bash
curl -s -H "x-push-secret: YOUR_PUSH_EVENT_SECRET" \
  https://app.publicsafetycrimecenter.com/api/push/diagnose | python3 -m json.tool
```

A pass looks like:

```json
{
  "apns": { "configured": true, "keyId": "ABC123XYZ0", "bundleId": "com.pscc.crimeai",
    "checks": [
      { "name": "APNs key parses", "ok": true },
      { "name": "APNs credentials (production)", "ok": true,
        "detail": "Apple accepted the JWT and rejected only the fake device token — this is the expected pass" }
    ]},
  "ok": true
}
```

Every failure comes back with a `fix` field naming the specific variable to
change. HTTP 200 = all green, 503 = something is wrong.

**This catches the mistakes that otherwise cost you a TestFlight round-trip:**
wrong key type (SIWA key instead of APNs), key ID not matching the .p8, wrong
team ID, wrong bundle ID, `private_key` newlines flattened on paste.

### Level 2 — prove the app receives (real device)

The Simulator cannot receive real APNs pushes. You need a physical iPhone.

1. Build to your iPhone from Xcode, accept the notifications prompt
2. Confirm a row landed: `select platform, created_at from device_tokens order by created_at desc limit 5;`
3. Send yourself one:
   ```sql
   -- from Supabase SQL editor, replace the uuid with your own
   select net.http_post(
     url := 'https://app.publicsafetycrimecenter.com/api/push/event',
     headers := jsonb_build_object('x-push-secret', 'YOUR_SECRET', 'content-type', 'application/json'),
     body := jsonb_build_object('type','test','record', jsonb_build_object('user_id','YOUR_USER_UUID'))
   );
   ```

⚠️ **Debug builds register against APNs *sandbox*, App Store/TestFlight builds
against *production*.** They are different token namespaces — a sandbox token
will fail with `BadDeviceToken` on the production host. `device_tokens` records
the environment per row so the sender picks the right host.

### Level 3 — prove the triggers fire

With two accounts (or a second device), do the real thing: comment on a post,
like a post past its milestone, send a DM, file a report near the other user.
Then check what was recorded:

```sql
select kind, title, sent, error, created_at
from push_deliveries order by created_at desc limit 20;
```

`sent = false` with an `error` tells you delivery failed; **no row at all**
tells you the trigger never fired — check `app_settings` has `push_endpoint`
and `push_secret`.

### Level 4 — app-side handling, no APNs at all

To test how the app *displays* and *routes* a notification without any server
round-trip, push a local payload straight into the Simulator:

```bash
xcrun simctl push booted com.pscc.crimeai payload.apns
```

with `payload.apns` = `{"aps":{"alert":{"title":"Test","body":"Body"}},"type":"comment"}`.
This exercises the tap-through and foreground handling only — it proves
nothing about your keys.

---

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
