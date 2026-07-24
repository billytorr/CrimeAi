// Provider registry — the single list of merchants CrimeAI can charge
// through. Adding a merchant = one import + one line here (see
// providers/_template.ts for the adapter walkthrough).
//
// A provider starts life as hostedLinkProvider(...) (redirect-only,
// manual reconciliation) and is upgraded to a full API adapter by
// replacing that line with the real implementation — nothing else in
// the app changes: checkout, webhooks and fulfillment are all routed
// through this registry.
import type { PaymentProvider } from "./types";
import { stripeProvider } from "./providers/stripe";
import { hostedLinkProvider } from "./providers/hosted-link";

const PROVIDERS: Record<string, PaymentProvider> = {
  stripe: stripeProvider,                                    // ✅ full API integration (reference)
  chase: hostedLinkProvider("chase", "Chase Payments"),      // upgrade path: providers/_template.ts
  square: hostedLinkProvider("square", "Square"),
  paypal: hostedLinkProvider("paypal", "PayPal"),
  authorize: hostedLinkProvider("authorize", "Authorize.net"),
  custom: hostedLinkProvider("custom", "Custom merchant"),
};

export const getProvider = (id: string): PaymentProvider | null => PROVIDERS[id] || null;
export const listProviders = (): PaymentProvider[] => Object.values(PROVIDERS);
