# PHASE 1 — Native authentication (Guideline 4)

## Browser handoffs removed

| # | Was | File:line (before) | Now |
|---|---|---|---|
| 1 | Apple button → `supabase.auth.signInWithOAuth` → **default Safari browser** | `lib/auth.ts:199-202` | Native `ASAuthorization` sheet in-app via `@capacitor-community/apple-sign-in` → `supabase.auth.signInWithIdToken` (SHA-256 nonce binding). Zero browser handoff. |
| 2 | Google button → same browser handoff | `components/auth/AuthScreen.tsx` SsoButtons | **Button removed on native iOS** (`hideGoogle` when `Capacitor.getPlatform()==="ios"`). Google remains on web/Android where the redirect is the platform norm. |

That is the complete list — email signup/login/forgot-password/verification were already fully native in-app (audited in `00-audit.md` §0.2) and are unchanged.

## What was added

- `lib/native/appleAuth.ts` — nonce generation (raw + SHA-256), native sheet invocation, readable cancel/failure errors for inline display.
- `lib/auth.ts` `ssoLogin`: native-iOS branch → `signInWithIdToken`; persists Apple's first-authorization full name to user metadata (Apple never sends it again). Web branch unchanged.
- `components/auth/AuthScreen.tsx`: iOS shows **Email + "Sign in with Apple"** only; button relabeled per Apple HIG when it stands alone.
- Dependency added (approved): `@capacitor-community/apple-sign-in@7.1.0` (peer `@capacitor/core >=7`; built for Cap 7 — verify at archive, API surface unchanged in Cap 8).
- `com.apple.developer.applesignin` entitlement — already present in `ios/App/App/App.entitlements` (no change needed).

## Config prerequisites (dashboard, not code)

1. Supabase → Auth → Providers → Apple: add **`com.pscc.crimeai`** to the authorized client IDs list (in addition to the existing Services ID used by web OAuth). Without it, `signInWithIdToken` rejects the native token with "Unacceptable audience".
2. Apple Developer portal: App ID `com.pscc.crimeai` must have the Sign in with Apple capability checked (auto-signing usually reconciles this from the entitlement at archive).

## Error/edge behavior

- Cancelled sheet → inline "Apple sign-in was cancelled." (no dead spinner).
- Token rejected by Supabase → the server message surfaces inline via the existing `run()` error path.
- Offline → fetch failure surfaces inline via the same path.
- ASSUMPTION: email-auth rate limiting is the custom signup routes' concern and was out of scope per audit decision (existing inline errors retained).
