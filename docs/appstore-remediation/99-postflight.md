# POST-FLIGHT CHECKLIST — App Store resubmission

Every row checkable in under a minute at the given evidence.
Status: ✅ done/verified · 🔲 dashboard action for Billy · 📱 confirm on-device in the TestFlight pass.

## Guideline 4

| Item | Status | Evidence | Verified by |
|---|---|---|---|
| Zero code paths open an external browser for sign-in/register/forgot/verification | ✅ | `lib/auth.ts` `ssoLogin` native branches; repo-wide `window.open` sweep = 0 hits in app code | grep + code review |
| Sign in, register, forgot password render natively | ✅ | `components/auth/AuthScreen.tsx` (pre-existing, audit §0.2) | audit |
| Sign in with Apple present and functional (native sheet, device Apple ID + Face ID) | ✅ 📱 | `lib/native/appleAuth.ts`; `signInWithIdToken` in `lib/auth.ts` | compile + device pass |
| Google sign-in uses the in-app browser (SFVC) + `crimeai://auth-callback` return | ✅ 📱 | `lib/auth.ts` google native branch; `lib/native/deepLinks.ts` | compile + device pass |
| Tokens in Keychain | ➖ deferred by decision | `98-out-of-scope.md` (WebView localStorage; not cited) | Phase 0 Q3 |
| Inline, specific auth error states | ✅ | `AuthScreen.tsx` `run()` + per-mode errors (pre-existing) | audit |
| Account deletion reachable in two taps from Settings | ✅ | `SettingsScreen.tsx` `DeleteAccount` (typed-DELETE confirm) | audit |
| Deletion cancels any active ARB subscription in the same transaction | ✅ | `app/api/me/delete/route.ts` (cancel-first, abort-on-failure) | Phase 2 |
| Deletion cascades across user content | ✅ | `supabase/store-compliance.sql` + FK cascades | audit |
| Deletion audit-logged, user id hashed | ✅ | `supabase/account-deletion-audit.sql` (apply before submission) | Phase 2 |

## Guideline 3.1.1

| Item | Status | Evidence | Verified by |
|---|---|---|---|
| `PaymentRegionPolicy` single decision point, no scattered checks | ✅ | `lib/pay/regionPolicy.ts`; only consumers: SettingsScreen, AskScreen upsell strings | grep |
| Storefront from StoreKit 2, re-evaluated on foreground | ✅ 📱 | `plugins/pscc-storefront/ios/.../Plugin.swift`; `resume` listener in regionPolicy | compile + device pass |
| Non-US storefront hides all pricing/paywall/CTAs; free tier usable | ✅ | `ProtectorPanel` returns null; AskScreen strings neutralized (`canUpsell`) | Phase 3+5 |
| Checkout opens in SFSafariViewController with signed short-lived token | ✅ 📱 | `SettingsScreen.tsx` `openCheckout` → `openInApp`; token route pre-existing | Phase 4 |
| Universal-link/scheme return path lands back in the app | ✅ 📱 | `crimeai://checkout-return`; `deepLinks.ts`; checkout `AutoReturn` | Phase 4 |
| Entitlement served only by backend; no client-authoritative writes | ✅ | `EntitlementService` + `tier_subscriptions`; client display-only | audit |
| Webhook signature verified (HMAC-SHA512), unsigned rejected 401 | ✅ | `app/api/pay/authnet/webhook/route.ts:31`; `lib/authnet/webhook-verify.test.ts` | tests |
| Webhook idempotent on event id | ✅ | `claim_webhook_event` (webhook route line 46) | audit |
| Nightly ARB reconciliation job | ✅ | `vercel.json` cron `0 8 * * *` → `/api/pay/authnet/reconcile` | audit |
| Restore access works on fresh install w/ paid account | ✅ 📱 | "Already a Protector? Restore access" in ProtectorPanel | Phase 4 |
| Cancel is native and calls ARB cancel | ✅ | `ManageSubscription` → `/api/pay/cancel` → `cancelSubscription()` | Phase 4 |

## Pricing & submission

| Item | Status | Evidence | Verified by |
|---|---|---|---|
| Every price is $7.99/mo or $69.99/yr; no stale figures | ✅ | Phase 5 sweep (0 hits); `tier_prices` canonical | grep |
| Annual saving computed, not hardcoded | ✅ | `annualSaving()` in `lib/authnet/pricing.ts` + `pricing.test.ts` | tests |
| App Store availability set to United States only | 🔲 | ASC → Pricing & Availability → country list | **Billy** |
| Demo account with active Protector | 🔲 | run `supabase/reviewer-protector.sql` (set the password), then put credentials in ASC review notes | **Billy** |
| No crypto/license-key/QR unlock paths; points non-purchasable, non-transferable | ✅ | Phase 5 sweep (0 hits) | grep |
| Supabase: Apple provider lists `com.pscc.crimeai`; Redirect URLs include `crimeai://auth-callback` | 🔲 | `01-auth.md` prerequisites | **Billy** |
| Apply migrations: `account-deletion-audit.sql`, `reviewer-protector.sql` | 🔲 | SQL Editor | **Billy** |

## Quality gates

| Item | Status | Evidence |
|---|---|---|
| Builds clean | ✅ | xcodebuild BUILD SUCCEEDED (Phase 3); `tsc` clean; 446 tests pass |
| PaymentRegionPolicy unit tests (USA / non-US / nil) | ✅ | `lib/pay/regionPolicy.test.ts` (6 cases) |
| Webhook signature tests incl. tampered payload | ✅ | `lib/authnet/webhook-verify.test.ts` |
| Entitlement transition tests incl. suspension/grace | ✅ | `lib/authnet/webhook-events.test.ts`, `lib/entitlements/service.test.ts` |
| Manual purchase-to-unlock test script | ✅ | below |

## Manual device script (TestFlight, build 7)

1. Fresh install → Create account (email) → fully in-app, no browser.
2. Log out → "Sign in with Apple" → native sheet, Face ID, lands signed-in.
3. Log out → "Google" → SFSafariViewController sheet (URL visible) → Google auth → sheet closes itself → signed in.
4. Settings → Become a Protector → Compare plans → SFVC opens pricing (URL/certificate visible) → subscribe with a test card → success page → returns to the app by itself → "Confirming your payment…" → Protector badge active.
5. Kill the app, reinstall, log in → Settings → "Restore access" → Protector recognized.
6. Settings (as Protector) → Cancel subscription → native confirm → shows "Protector until <date>".
7. Settings → Delete account → screen states deleted/kept/subscription-cancelled → type DELETE → account gone; verify no further ARB charge in Authorize.Net.
8. Storefront check: device signed into a **non-US** Apple ID → paywall and all pricing absent; app fully usable free.
