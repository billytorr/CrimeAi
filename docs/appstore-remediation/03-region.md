# PHASE 3 — Region-aware payment gate (PaymentRegionPolicy)

## The single decision point

`lib/pay/regionPolicy.ts` — the ONLY module allowed to decide whether external
purchase UI renders. Every purchase surface asks it via `usePaymentRegion()`;
there are no scattered `if (isUS)` checks anywhere.

| Platform | Decision |
|---|---|
| iOS | **StoreKit 2 `Storefront.current?.countryCode`** (via the in-repo `pscc-storefront` plugin). In the allowed list → `allowed`. Anything else **including nil → `blocked` (fail closed)**. |
| web | `allowed` — a browser is not an App Store |
| android | `allowed` — Google Play billing compliance is its own track (documented in 98-out-of-scope) |

- **Not** device locale, not IP geolocation, not the profile country — Apple evaluates against the storefront and locale is wrong for travelers/expats.
- **Foreground re-evaluation:** the policy re-reads the storefront on every app `resume` (storefronts can change at runtime), and pushes changes to subscribed components.
- **Config-driven expansion:** `NEXT_PUBLIC_ALLOWED_STOREFRONTS="USA,CAN,…"` (ISO alpha-3, defaults to `USA`). New storefronts ship by env change, not code.
- iOS renders **blocked-first** until the storefront answers — a brief absence of the paywall beats flashing purchase UI at a storefront that must never see it.

## The storefront plugin (no third-party dependency)

`plugins/pscc-storefront/` — an in-repo Capacitor plugin (~30 lines of Swift we own):
- `ios/Sources/PsccStorefront/Plugin.swift` — `CAPPlugin`+`CAPBridgedPlugin`, one method `getCountry()` → StoreKit 2 `Storefront.current`, `{}` when unavailable.
- Installed as `npm i ./plugins/pscc-storefront`; the Capacitor CLI detects it (6th iOS plugin) and `cap sync` regenerates the SPM entry — survives every sync, unlike hand-edits to `CapApp-SPM/Package.swift`.
- iOS 15+ (the app's deployment target), so StoreKit 2 needs no availability guards.

## Gated surfaces

- `components/screens/SettingsScreen.tsx` `ProtectorPanel` — the app's only in-app purchase pitch (price line, benefit copy, "Compare plans →" checkout CTA). When `blocked`, the panel **does not render at all**; the free tier is otherwise untouched and fully usable. The manage view for *existing* subscribers is not purchase steering and remains.
- `components/PlanComparison.tsx` renders only on the web pricing pages (opened during checkout), never inside the app — nothing to gate there.
- Feature-upsell strings inside CrimeAI chat replies ("Upgrade in Settings → Become a Protector") reference a panel that no longer exists when blocked; scrubbing those strings per-region is a Phase 5 sweep item.

## Tests (MD quality gate)

`lib/pay/regionPolicy.test.ts` — 6 cases: iOS+USA → allowed; iOS+CAN/GBR/DEU → blocked; iOS+nil/empty → **blocked (fail closed)**; case-insensitivity; web/android → allowed; config-list expansion allows without code change.

## Verification

- `npx cap sync ios` detects `pscc-storefront@1.0.0`.
- Full app compile via `xcodebuild` (simulator target) — see commit notes; runtime storefront read to be confirmed on the TestFlight device pass (Phase 5 manual script).
