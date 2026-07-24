# CrimeAI Payments — Merchant Integration Guide

CrimeAI charges for the **Protector Plan** ($9.11/mo) through the web
(`pay.publicsafetycrimecenter.com/crimeai/checkout`) so Apple/Google take no
cut. The payment layer is **merchant-agnostic**: any payment provider —
Stripe, Chase, Braintree, Adyen, Square, PayPal, a bank's own gateway — plugs
in by implementing one TypeScript interface. This document is everything a
developer needs to wire a new merchant end-to-end.

---

## Architecture

```
 User (app → Settings → Protector Plan)
   │
   ▼
 pay.publicsafetycrimecenter.com/crimeai/checkout        ← user-facing page
   │  POST /api/pay/create-session { userId, email }
   ▼
 lib/payments/registry.ts  →  active provider adapter
   │  adapter.createCheckout()  →  { url }
   ▼
 Merchant's secure hosted payment page  (card data never touches CrimeAI)
   │
   │  merchant webhook (signed)
   ▼
 POST /api/pay/webhook/<provider-id>
   │  adapter.verifyWebhook()  → NormalizedPaymentEvent[]
   ▼
 lib/payments/fulfill.ts  — the ONLY code that touches entitlements:
   profiles.plan · subscriptions · payments      (service-role, bypasses RLS)
   │
   ▼
 Red Protector badge live in feed/profile · revenue visible in
 Command Center → Finance
```

Key files:

| File | Role |
|---|---|
| `lib/payments/types.ts` | The provider contract + normalized event model |
| `lib/payments/registry.ts` | List of merchants; add yours here |
| `lib/payments/providers/stripe.ts` | **Reference implementation** — copy its patterns |
| `lib/payments/providers/_template.ts` | Skeleton to copy for a new merchant |
| `lib/payments/providers/hosted-link.ts` | Redirect-only stopgap (manual reconciliation) |
| `lib/payments/fulfill.ts` | Fulfillment engine — grants/revokes Protector |
| `lib/payments/webhook.ts` | Shared webhook handler (verify → fulfill) |
| `app/api/pay/*` | HTTP surface (create-session, webhook/[provider], portal, status, providers) |
| `supabase/billing.sql`, `supabase/billing-subscriptions.sql` | Schema |

## The contract (`lib/payments/types.ts`)

```ts
interface PaymentProvider {
  id: string;                 // "chase" — used in payment_config + webhook URL
  label: string;              // "Chase Payments" — shown in Command Center
  mode: "api" | "hosted-link";
  requiredEnv: string[];      // e.g. ["CHASE_SECRET_KEY", "CHASE_WEBHOOK_SECRET"]
  ready(conf): boolean;
  createCheckout(req, conf): Promise<{ url: string }>;
  verifyWebhook?(req, rawBody): Promise<{ events: NormalizedPaymentEvent[] }>;
  cancelSubscription?(subscriptionId): Promise<void>;
  manageUrl?(customerId, returnUrl): Promise<{ url: string }>;
}
```

Adapters translate merchant payloads into **five normalized events** —
`subscription_started`, `payment_succeeded`, `subscription_updated`,
`subscription_canceled`, `payment_refunded` — and never touch the database.
`fulfill.ts` applies them identically for every merchant, with idempotency on
`externalId` (webhooks retry; we never double-record).

## Adding a merchant, step by step

1. **Copy the template**
   ```bash
   cp lib/payments/providers/_template.ts lib/payments/providers/chase.ts
   ```
2. **Implement the methods** with the merchant's API. Non-negotiables:
   - `req.userId` must round-trip: send it at checkout (metadata / reference /
     custom field), read it back in the webhook. This is how a payment maps to
     a CrimeAI account.
   - `verifyWebhook` **must authenticate** (HMAC signature, basic auth, mTLS —
     whatever the merchant offers) and throw `WebhookVerificationError` on
     failure. An unauthenticated webhook endpoint = free Protector plans for
     anyone who finds the URL.
   - Secrets come **only** from `process.env`. Never the database, never the
     client bundle, never git.
3. **Register it** in `lib/payments/registry.ts` — replace the
   `hostedLinkProvider("chase", …)` line with your adapter.
4. **Set env vars** in Vercel (main app project) and `.env.local` for dev.
   Naming convention: `<PROVIDER>_SECRET_KEY`, `<PROVIDER>_WEBHOOK_SECRET`.
5. **Point the merchant's webhook** at
   `https://app.publicsafetycrimecenter.com/api/pay/webhook/<id>`.
6. **Activate** in Command Center → Finance → merchant provider dropdown.
   The Finance integration board shows the adapter as API-integrated with a
   green check once its env vars are present.

## Testing checklist

- [ ] `npx tsc --noEmit` passes
- [ ] Checkout: open `/crimeai/checkout?uid=<test-user-id>&email=<email>` →
      Continue → lands on the merchant's payment page (use sandbox keys)
- [ ] Webhook happy path: complete a sandbox payment → user's
      `profiles.plan = 'pro'`, rows in `payments` + `subscriptions`, red badge
      in feed
- [ ] Webhook retry: redeliver the same event → **no duplicate** payments row
- [ ] Bad signature: `curl -X POST …/api/pay/webhook/<id> -d '{}'` → **400**
- [ ] Cancel at merchant → `profiles.plan = 'free'`, subscription `canceled`
- [ ] Refund → `payments` row with `kind='refund'`
- [ ] Command Center → Finance shows the payment and the member

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (main app) — server only | Webhook writes (bypasses RLS). **Never in app bundle.** |
| `STRIPE_SECRET_KEY` | Vercel | Stripe API calls |
| `STRIPE_WEBHOOK_SECRET` | Vercel | Stripe webhook signature check |
| `<PROVIDER>_SECRET_KEY` / `<PROVIDER>_WEBHOOK_SECRET` | Vercel | Your new merchant, same pattern |
| `NEXT_PUBLIC_PAY_BASE` | optional | Checkout base URL override (defaults to pay.publicsafetycrimecenter.com) |

## Operational notes

- **Merchant identity is back-office info.** The public `/api/pay/status`
  returns only `{ ready, plan }` — never which merchant is active.
- **Manual reconciliation** always works as a safety net: Command Center →
  Finance can grant/revoke Protector by email (audit-logged). That's also the
  workflow while a merchant is still in hosted-link mode.
- The legacy `/api/pay/webhook` endpoint still accepts Stripe (routes by
  `stripe-signature` header) so older dashboard config keeps working; new
  merchants use `/api/pay/webhook/<id>` only.
