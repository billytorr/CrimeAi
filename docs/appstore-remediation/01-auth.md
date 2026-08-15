# PHASE 1 — Native authentication (Guideline 4)

## Browser handoffs removed

| # | Was | File:line (before) | Now |
|---|---|---|---|
| 1 | Apple button → `supabase.auth.signInWithOAuth` → **default Safari browser** | `lib/auth.ts:199-202` | **Native `ASAuthorization` sheet in-app** (`@capacitor-community/apple-sign-in`) → `supabase.auth.signInWithIdToken` (SHA-256 nonce binding). The system sheet recognizes the device's Apple ID — Face ID confirm, no web page, no typing. |
| 2 | Google button → same browser handoff | `lib/auth.ts` (same call) | OAuth page opens in the **in-app browser** — `Browser.open` = **SFSafariViewController** on iOS / Custom Tabs on Android (exactly the API Apple's letter endorses: URL + certificate visible, user stays in the app shell). Supabase redirects to `crimeai://auth-callback`; the deep-link listener installs the session and closes the sheet. |

That is the complete list — email signup/login/forgot-password/verification were already fully native in-app (audited in `00-audit.md` §0.2) and are unchanged. Web keeps the standard redirect (the browser *is* the platform there).

## What was added

- `lib/native/appleAuth.ts` — nonce generation (raw + SHA-256), native sheet invocation, readable cancel/failure errors for inline display.
- `lib/native/deepLinks.ts` — `crimeai://` handler (`@capacitor/app` `appUrlOpen`): `auth-callback` installs the Supabase session from the fragment tokens and fires `crimeai:authed`; `checkout-return` is pre-seated for Phase 4. Closes the browser sheet on arrival.
- `lib/auth.ts` `ssoLogin`: native Apple → `signInWithIdToken` (persists Apple's first-authorization name — Apple never sends it again); native Google → `signInWithOAuth` with `skipBrowserRedirect` + `redirectTo: crimeai://auth-callback`, URL opened via `openInApp` (SFVC). Web branches unchanged.
- `app/page.tsx` — installs the deep-link listener on boot; `crimeai:authed` triggers the normal account refresh so the shell advances without a reload.
- URL scheme `crimeai://` registered: `ios/App/App/Info.plist` (`CFBundleURLTypes`) and `android/app/src/main/AndroidManifest.xml` (VIEW/BROWSABLE intent filter).
- Dependencies added (approved): `@capacitor-community/apple-sign-in@7.1.0` (built for Cap 7 — verify at archive; API surface unchanged in Cap 8), `@capacitor/app@8.1.1` (official; also required for Phase 4's checkout return).
- `com.apple.developer.applesignin` entitlement — already present in `ios/App/App/App.entitlements` (no change needed).

## Config prerequisites (dashboard, not code)

1. Supabase → Auth → Providers → Apple: add **`com.pscc.crimeai`** to the authorized client IDs list (in addition to the existing Services ID used by web OAuth). Without it, `signInWithIdToken` rejects the native token with "Unacceptable audience".
2. Supabase → Auth → URL Configuration → Redirect URLs: add **`crimeai://auth-callback`**. Without it, the Google return leg is refused.
3. Apple Developer portal: App ID `com.pscc.crimeai` must have the Sign in with Apple capability checked (auto-signing usually reconciles this from the entitlement at archive).

## Error/edge behavior

- Cancelled sheet → inline "Apple sign-in was cancelled." (no dead spinner).
- Token rejected by Supabase → the server message surfaces inline via the existing `run()` error path.
- Offline → fetch failure surfaces inline via the same path.
- ASSUMPTION: email-auth rate limiting is the custom signup routes' concern and was out of scope per audit decision (existing inline errors retained).
