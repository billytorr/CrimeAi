# Out of scope for this remediation (flagged, not fixed)

- **Google Play billing policy (Android):** Play has its own external-payment rules and its own US allowance mechanics. The Android build currently treats external checkout as allowed; a Play-specific compliance pass is a separate track before Play submission.
- **Keychain token storage:** Supabase session lives in WKWebView localStorage (the Capacitor norm; not cited by Apple). Deferred by decision in Phase 0 open questions; revisit post-approval with a secure-storage adapter.
- **Server-composed vs client-composed upsell copy:** the four purchase-steering strings are client-side and now region-gated. A future i18n/upsell abstraction could centralize them; not needed for compliance.
- **`@capacitor-community/apple-sign-in` is built for Capacitor 7** (peer `>=7`): compiles and links under Capacitor 8 (xcodebuild BUILD SUCCEEDED); watch the plugin repo for an 8.x release.
- **Authorize.Net sandbox cannot exercise Apple Pay / Google Pay** — wallet buttons on the web checkout require the production processor to test (pre-existing note).
- **Self-serve cancel existed as "email support" and is now native** — the `/api/pay/portal` route remains for the update-card path only.
