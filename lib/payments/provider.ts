// Merchant-agnostic payment layer (server-side only).
// The active provider is chosen in payment_config (Command Center →
// Finance); each provider is an adapter behind this interface, so
// switching merchants (Stripe today, Chase tomorrow) never touches the
// app, checkout page, or database schema. Secret keys live ONLY in
// server env vars — never in the database or the app bundle.
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
  ready(): boolean;                       // are the env keys present?
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
}

// ── Stripe (ready to activate: set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET) ──
export const stripeProvider: PaymentProvider = {
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

// ── Chase Payment Solutions (slot prepared; integration keys TBD) ──
export const chaseProvider: PaymentProvider = {
  id: "chase",
  ready: () => false, // wire Chase Integrated Payments credentials here when the merchant account exists
  async createCheckout() {
    throw new Error("Chase merchant integration is not configured yet.");
  },
};

const PROVIDERS: Record<string, PaymentProvider> = {
  stripe: stripeProvider,
  chase: chaseProvider,
};

export const getProvider = (id: string): PaymentProvider | null => PROVIDERS[id] || null;
