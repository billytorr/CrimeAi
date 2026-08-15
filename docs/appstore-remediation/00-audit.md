# PHASE 0 AUDIT — App Store Rejection Remediation

Submission `3f4e3405-feea-49f2-9f0c-a36e1fa3be69` · v1.0 (1) · rejected 2026-08-15
Citations: **Guideline 4** (browser handoff for sign-in; account-deletion note) · **Guideline 3.1.1** (external-purchase content without IAP).

---

## 0.1 Ground truth

| Item | Finding |
|---|---|
| Repo | Single repo. Root = user PWA (Next.js 14 App Router). `command-center/` = admin portal. `ios/` + `android/` = Capacitor shells. `supabase/` = hand-applied SQL migrations. |
| iOS stack | **Capacitor 8.4.2 shell around a locally bundled static Next.js export** (`out/` → `ios/App/App/public`). NOT SwiftUI/UIKit-native, and NOT a remote WebView of the website — the JS bundle ships in the binary and calls the prod API (`NEXT_PUBLIC_API_BASE=https://app.publicsafetycrimecenter.com`). |
| Native plugins | `@aparajita/capacitor-biometric-auth`, `@capacitor/push-notifications`, `@capacitor/browser` (**= SFSafariViewController on iOS** — already installed). |
| Xcode / targets | Xcode 26.0.1; `com.pscc.crimeai`; Team `5Q28Y7C4FL`; auto-signing; currently **1.0 (6)** locally (Apple reviewed build 1). |
| Backend | Next.js API routes on Vercel (Hobby) + Supabase (Postgres/Auth/Storage, RLS). Same repo (`app/api/**`). CORS middleware for the native origins (`middleware.ts`). |
| Payments | Authorize.Net: Accept.js + CIM profiles + ARB (`lib/authnet/*`). Immediate `authCaptureTransaction` on subscribe. |
| Tests / CI | Vitest, 439 passing, incl. safety-path CI guards. |

## 0.2 Auth paths

**THE Guideline-4 line:** [lib/auth.ts:199-202](../../lib/auth.ts) —

```ts
const { error } = await supabase!.auth.signInWithOAuth({
  provider,   // "google" | "apple"
  options: { redirectTo: window.location.origin },  // = capacitor://localhost in the app
});
```

Triggered from the **Google / Apple buttons** at [components/auth/AuthScreen.tsx:91,129](../../components/auth/AuthScreen.tsx) (`ssoLogin`). In the native shell this navigates the WebView to the external Supabase OAuth URL, which **escapes to the default Safari browser** — exactly what Apple cited. (`redirectTo = capacitor://localhost` also breaks the return leg.)

Everything else is already native in-app — **no other browser handoffs exist in auth**:
- Email-first signup (code verify → username/password): `startEmailSignup / verifyEmailSignup / setSignupCredentials` — in-app forms → backend.
- Login, forgot password (code → new password): in-app forms.
- Inline error states exist (wrong password, unverified email, duplicate account via `account_exists` RPC).

Other audit answers:
- **Auth provider:** Supabase Auth (JWT). Sessions via `supabase-js` `persistSession: true` → **WebView localStorage**, not Keychain ([lib/supabase.ts:12](../../lib/supabase.ts)).
- **Sign in with Apple:** exists as a *button*, but routed through the browser OAuth above — i.e., present but the broken path.
- **Account deletion:** **EXISTS, in-app**: Settings → Danger zone → "Delete account" ([SettingsScreen.tsx:492](../../components/screens/SettingsScreen.tsx)) → confirm sheet → `delete_my_account()` RPC ([supabase/store-compliance.sql](../../supabase/store-compliance.sql)) → deletes `auth.users` row; FK `ON DELETE CASCADE` wipes profiles/posts/likes/comments/messages/etc. **Two taps from Settings. Not a mailto/web link.**

## 0.3 Payment & entitlement paths

**What triggers the 3.1.1 citation:** the app sells/steers Protector externally and unlocks web-purchased Protector, with no IAP:
1. [components/screens/SettingsScreen.tsx:310](../../components/screens/SettingsScreen.tsx) — "Become a Protector" → `window.open(pay/pricing?t=<signed token>, "_blank")` → **default device browser**.
2. [SettingsScreen.tsx:337](../../components/screens/SettingsScreen.tsx) — billing portal link, same pattern.
3. Protector badge/features unlock from backend entitlement regardless of where purchased (`/api/pay/status`, `EntitlementService` → `tier_subscriptions`).

- **Feature gates:** all server-side via `EntitlementService.can/consume` (metered `ai_*` caps) + client `profile.plan === "pro"` for UI affordances. Client is never authoritative (constraint 5 already satisfied).
- **Prices:** canonical **$7.99/mo (799¢) & $69.99/yr (6999¢)** in `tier_plans` (`supabase/pricing-plans.sql`; the old `pro_499` A/B arm is retired by that same migration). Client `PlanComparison` renders prices **from the API**, not hardcoded. Grep found no stale user-facing price strings (the `9.99` hits are an admin-portal input placeholder in `command-center/components/Finance.tsx`; the BottomNav hit is an SVG path coincidence).
- **StoreKit/IAP code:** none anywhere.
- **Checkout return path:** **none** — no universal link, no custom scheme, no `appUrlOpen` listener. After paying in the browser the user manually returns; entitlement refreshes on next app open.
- **Annual saving:** computed on the pricing page from the two prices (not hardcoded) — verify during Phase 4.

## 0.4 Backend

- **Tables:** `tier_plans`, `tier_prices`, `tier_subscriptions` (user_id, plan_id, status, period, grace_until, price_id), `tier_limits`, `payment_webhook_events`, `entitlement_usage`, `enforcement_flags`.
- **Authorize.Net:** Accept.js (SAQ-A tokenization) + CIM customer profiles + ARB monthly/annual (`lib/authnet/arb.ts`); immediate first charge via `authCaptureTransaction`; `cancelSubscription()` **already implemented** at [lib/authnet/arb.ts:170](../../lib/authnet/arb.ts).
- **Webhooks:** [app/api/pay/authnet/webhook/route.ts](../../app/api/pay/authnet/webhook/route.ts) — **HMAC-SHA512 `X-ANET-Signature` verified against the raw body; unsigned/mismatched → 401** (line 31-33). **Idempotent** via `claim_webhook_event` on `notificationId` (line 46). Handles subscription lifecycle + authcapture events with **grace/dunning** (`decideSubscriptionEvent`, `graceDaysFromEnv`).
- **Reconciliation:** nightly cron `0 8 * * *` → `/api/pay/authnet/reconcile` ([vercel.json](../../vercel.json)).
- **App→backend auth:** Supabase JWT as `Authorization: Bearer` on every API call.
- **Self-serve cancel:** **missing** — portal route returns "email support" ([app/api/pay/portal/route.ts:32](../../app/api/pay/portal/route.ts)) even though the ARB cancel function exists.

---

## PRE-FLIGHT CHECKLIST

| # | Item | Current state | Required state | Risk | Files touched |
|---|---|---|---|---|---|
| **P1** Guideline 4 — auth |
| 1 | Google/Apple SSO opens default browser | `signInWithOAuth` browser redirect (lib/auth.ts:199) | Native: SIWA via native ASAuthorization → `supabase.auth.signInWithIdToken`; Google either same-pattern native or removed on iOS v1 | **The** G4 rejection | lib/auth.ts, components/auth/AuthScreen.tsx, ios plugin or dep |
| 2 | Email auth flows | Already native in-app | No change | none | — |
| 3 | Sign in with Apple | Button exists, broken path | Functional native SIWA | High (4.8 requires it while Google exists) | same as #1 |
| 4 | Token storage | WebView localStorage (Capacitor norm) | MD wants Keychain — **needs a decision** (new dep or custom plugin or accepted deviation) | Low (not a cited rejection) | lib/supabase.ts (+plugin) |
| 5 | Inline auth errors | Present | Verify + fill gaps (429 message) | Low | AuthScreen.tsx |
| **P2** Deletion |
| 6 | In-app deletion ≤2 taps | ✅ Exists (Settings → Delete account) | Keep | none | — |
| 7 | Deletion cancels active ARB | ❌ **Missing — orphaned recurring charges** | Backend deletion endpoint cancels ARB then deletes | **High** (legal/chargeback) | new api route, lib/moderation.ts, arb.ts |
| 8 | Plain-language deletion screen | Basic confirm only | State what's deleted/retained + subscription note | Med | SettingsScreen.tsx |
| 9 | Audit log (hashed id) | None | Log deletion events | Low | deletion route |
| **P3** Region gate |
| 10 | Storefront read | Nothing exists | Tiny custom Swift plugin exposing StoreKit 2 `Storefront.current?.countryCode` (no 3rd-party dep) + Android/web fallback | High for future storefronts | new ios plugin, lib/pay/regionPolicy.ts |
| 11 | Single `PaymentRegionPolicy` | Nothing | One policy object; `USA`→allowed, else/nil→blocked; re-eval on foreground | High | lib/pay/regionPolicy.ts + paywall entry points |
| 12 | Blocked state hides ALL purchase UI | N/A | Paywall/CTAs/prices hidden; free tier fully usable | High | SettingsScreen, PlanComparison, upsell strings |
| **P4** Checkout & entitlement |
| 13 | Checkout opens default browser | `window.open` (SettingsScreen:310,337) | `Browser.open` (**SFSafariViewController** — plugin already installed) with signed short-lived token (already have) | **The** 3.1.1 UX fix; letter explicitly recommends SFVC | SettingsScreen.tsx, lib/inappbrowser.ts |
| 14 | Return path | None | Custom scheme/universal link → `appUrlOpen` → close browser + poll entitlement ≤60s w/ manual refresh | Med | capacitor.config, ios Info.plist, App.tsx-level listener, success page |
| 15 | Entitlement endpoint | `/api/pay/status` (equivalent data) | Extend to serve `tier/status/renews_at/cancel_at_period_end/source` (keep route name) | Low | app/api/pay/status |
| 16 | Webhook signature/idempotency/dunning/reconcile | ✅ All present | Verify + unit tests | Low | tests only |
| 17 | Client entitlement cache | Fetch on launch | + foreground + checkout-return refresh + **Restore access** button | Med (reviewers test restore) | app shell, paywall |
| 18 | Native cancel | ❌ "email support" | In-app cancel → backend → `cancelSubscription()` (exists) | Med | portal route, SettingsScreen |
| **P5** Submission |
| 19 | US-only availability | Not set (ASC dashboard) | Set US-only | — | ASC (Billy) |
| 20 | Stale prices | None found (7.99/69.99 canonical) | Final grep before submit | Low | — |
| 21 | Demo reviewer account | `reviewer@crimeai.app` exists, needs pwd reset + Protector | Provision active Protector entitlement | Med | SQL (Billy) |
| 22 | No crypto/license-key unlocks | Watch Points/Guardian Score are non-purchasable | Verify copy says so | Low | copy check |

## ASSUMPTIONS

- `ASSUMPTION:` The rejected build is the Capacitor static-bundle app (build 1 of the same architecture as current build 6) — not some other WebView wrapper.
- `ASSUMPTION:` Email/password + email-code auth is acceptable to Apple as-is (it is fully in-app); only the SSO buttons caused the G4 citation.
- `ASSUMPTION:` We follow the rejection letter's own recommendation (SFSafariViewController + external link) under the US 3.1.1(a)/anti-steering allowance, per FOUNDERS.md — **without** applying for the StoreKit External Purchase Link entitlement for v1.0.
- `ASSUMPTION:` Google Play (Android) billing policy is out of scope for this remediation; it has its own rules and its own track.
- `ASSUMPTION:` App Store Connect actions (US-only availability, review notes, demo account) are performed by Billy in the dashboard.

## OPEN QUESTIONS (need answers before code)

1. **Sign in with Apple (native):** two options — (a) add `@capacitor-community/apple-sign-in` (one new, well-maintained dep; needs your approval per constraint 4), or (b) I write a small custom Swift plugin using `ASAuthorizationController` (zero new deps, slightly more code to own). Both end in `supabase.auth.signInWithIdToken` (no browser). **Which?** My recommendation: (a).
2. **Google login on iOS:** keep it via the same in-app pattern (needs a Google plugin dep), or **drop the Google button on iOS for v1.0** (email + Apple only — simplest, zero deps, G4-safe)? My recommendation: drop on iOS for v1, keep on web/Android.
3. **Keychain tokens:** WebView localStorage is the Capacitor norm and was not cited by Apple. Moving to Keychain requires a secure-storage plugin (new dep) wired as a custom Supabase storage adapter. Do it now, or accept the deviation and note it? My recommendation: accept for v1.0, revisit.
4. **Entitlement route naming:** MD names `GET /v1/entitlements/me`; we have `/api/pay/status` with the same data. I plan to extend `/api/pay/status` (add the missing fields) rather than rename. Confirm?
5. **Android checkout:** apply the same SFSafariViewController-equivalent (Custom Tabs via the same `Browser.open`) now, or leave Android checkout untouched this pass?
