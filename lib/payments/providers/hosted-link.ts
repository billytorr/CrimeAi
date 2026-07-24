// Hosted-link — universal STOPGAP adapter for merchants whose API
// integration hasn't been built yet. Redirects to the merchant's own
// hosted checkout page (pasted in Command Center → Finance) with the
// user id attached as ?ref=, and payments are reconciled manually
// (grant/revoke Protector in Finance) until a real adapter replaces it.
//
// This is intentionally the fallback, not the destination: copy
// providers/_template.ts to build the full API integration.
import type { PaymentProvider } from "../types";

export function hostedLinkProvider(id: string, label: string): PaymentProvider {
  return {
    id,
    label,
    mode: "hosted-link",
    requiredEnv: [],
    ready: (conf) => !!conf.checkout_url?.trim(),
    async createCheckout(req, conf) {
      const base = conf.checkout_url!.trim();
      const sep = base.includes("?") ? "&" : "?";
      return { url: `${base}${sep}ref=${encodeURIComponent(req.userId)}&email=${encodeURIComponent(req.email)}` };
    },
    // no verifyWebhook / cancelSubscription / manageUrl — that's what
    // makes this "hosted-link" mode; Finance shows it as not API-integrated
  };
}
