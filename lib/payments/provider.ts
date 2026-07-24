// Merchant-agnostic payment layer (server-side only).
// Works with ANY payment provider, two integration styles:
//
//   1. API-integrated — full programmatic checkout + webhooks.
//      Stripe ships ready (set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET).
//      Deeper integrations (Chase Orbital API, Braintree, etc.) implement
//      this same interface when their credentials exist.
//
//   2. Hosted-link — for every other merchant (Chase hosted checkout,
//      Square payment links, PayPal subscriptions, Authorize.net pages…):
//      paste the provider's hosted checkout URL in Command Center →
//      Finance, and CrimeAI redirects there with the user reference
//      attached. Payments are reconciled from the Finance page
//      (grant/revoke Protector) until that provider's webhook is wired.
//
// The active provider + its non-secret config live in payment_config;
// secret keys live ONLY in server env vars.
export interface PaymentConfig {
  provider: string;
  currency: string;
  checkout_url?: string;
}

export interface CheckoutRequest {
  userId: string;
  email: string;
  priceCents: number;
  planName: string;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentProvider {
  id: string;
  ready(conf: PaymentConfig): boolean;
  createCheckout(req: CheckoutRequest, conf: PaymentConfig): Promise<{ url: string }>;
}

// ── Stripe: fully API-integrated ────────────────────────────────────
const stripeProvider: PaymentProvider = {
  id: "stripe",
  ready: () => !!process.env.STRIPE_SECRET_KEY,
  async createCheckout(req) {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: req.userId,
      customer_email: req.email || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: req.priceCents,
          recurring: { interval: "month" },
          product_data: { name: `CrimeAI ${req.planName}` },
        },
      }],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
    });
    return { url: session.url! };
  },
};

// ── Hosted-link: universal adapter for ANY merchant ─────────────────
// Redirects to the provider's own hosted checkout, carrying the user id
// as ?ref= so payments can be matched back to the account.
function hostedLinkProvider(id: string): PaymentProvider {
  return {
    id,
    ready: (conf) => !!conf.checkout_url?.trim(),
    async createCheckout(req, conf) {
      const base = conf.checkout_url!.trim();
      const sep = base.includes("?") ? "&" : "?";
      return { url: `${base}${sep}ref=${encodeURIComponent(req.userId)}&email=${encodeURIComponent(req.email)}` };
    },
  };
}

const PROVIDERS: Record<string, PaymentProvider> = {
  stripe: stripeProvider,
  chase: hostedLinkProvider("chase"),
  square: hostedLinkProvider("square"),
  paypal: hostedLinkProvider("paypal"),
  authorize: hostedLinkProvider("authorize"),
  custom: hostedLinkProvider("custom"),
};

export const getProvider = (id: string): PaymentProvider | null => PROVIDERS[id] || null;
