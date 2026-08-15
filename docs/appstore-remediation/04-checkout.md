# PHASE 4 — External checkout & entitlement (Guideline 3.1.1(a))

## 4.1 Paywall / checkout handoff
- The in-app pitch (Settings `ProtectorPanel`, region-gated by Phase 3) mints the **signed short-lived checkout token** (pre-existing) and now opens the pricing/checkout pages in the **in-app browser** — `Browser.open` = **SFSafariViewController** on iOS / Custom Tabs on Android, exactly what Apple's rejection letter recommends. The `window.open` (default device browser) calls Apple cited are gone (checkout + portal).
- Prices come from `tier_plans`/`tier_prices` ($7.99 / $69.99); the annual saving is **computed** (`annualSaving()` in `lib/authnet/pricing.ts`), never hardcoded.
- Copy states where the user is going and that the address/certificate are visible; nothing implies Apple processes payment.

## 4.2 Return path
- The app appends `app=1` to the checkout URL; the web flow threads it through pricing → checkout.
- On success the page auto-fires **`crimeai://checkout-return`** (1.2s) with a manual "Return to CrimeAI" button as fallback; the web-only `returnTo` redirect is skipped when `app=1`.
- The Phase-1 deep-link listener closes the browser sheet and fires the checkout-return event. `AppShell` then **polls entitlement with backoff (2s→8s) for up to 60s** behind a "Confirming your payment…" banner; if the webhook still hasn't landed it switches to a manual-refresh banner. A paying user is never left at a locked paywall.

## 4.3 Entitlement service (pre-existing, verified in Phase 0)
- Source of truth: `tier_subscriptions`, populated only by signature-verified (HMAC-SHA512, 401 on mismatch), idempotent (event-id claim) Authorize.Net webhooks, with grace/dunning on suspension and a nightly reconcile cron.
- `GET /api/me/entitlements` now also returns the MD's fields: `tier`, `status`, `renews_at`, `cancel_at_period_end`, `source` (route name kept per audit decision).
- Existing test files cover the MD gates: `webhook-verify.test.ts` (signature incl. bad payloads), `webhook-events.test.ts` (state transitions incl. suspension/grace), `entitlements/service.test.ts`.

## 4.4 Client entitlement cache
- Fetch on launch (pre-existing account load) + **on app foreground** (resume listener) + **after checkout return** (poll above). Client state is display-only; every real gate stays server-side (Phase-0 rule, unchanged).
- **Restore access**: "Already a Protector? Restore access" on the paywall pitch force re-checks the server and flips the panel — the fresh-install-with-paid-account path reviewers test.

## 4.5 Manage & cancel (native)
- `ManageSubscription` (Settings, Protector view): renewal date + **native two-step cancel** ("Keep Protector" / "Confirm cancel") → `POST /api/pay/cancel` → existing `cancelSubscription()` ARB call → `cancel_at_period_end=true`. End-of-period semantics: access continues until `current_period_end`; webhooks/reconcile settle the final transition. Idempotent; "already cancelled" at ARB counts as done. The email-support dead end is gone.

## Files
`SettingsScreen.tsx` (SFVC checkout, ManageSubscription, Restore access) · `AppShell.tsx` (return poll + banners + foreground refresh) · `app/api/pay/cancel/route.ts` *(new)* · `app/api/me/entitlements/route.ts` (fields) · `app/crimeai/pricing/page.tsx` + `checkout/page.tsx` (`app=1` + deep-link return).
