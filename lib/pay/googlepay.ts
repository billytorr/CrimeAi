"use client";

// Google Pay for the web, tokenised through Authorize.Net.
//
// The wallet returns a token that goes into the SAME opaqueData slot the
// card form already uses, so the immediate charge, the ARB schedule and the
// period maths downstream are untouched — the piece we tested is the piece
// that runs.
//
// DORMANT-SAFE: without NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID this reports
// unavailable and the checkout page renders the card form alone.
//
// ⚠️ RECURRING CAVEAT — read before trusting this for subscriptions.
// Google Pay can return two kinds of credential:
//   • PAN_ONLY        — a card saved in the Google account. Real card
//                       details, storable in a CIM profile, chargeable again.
//   • CRYPTOGRAM_3DS  — a device token with a one-shot cryptogram. Fine for
//                       the charge in front of you, NOT reliably reusable for
//                       a later renewal.
// We request both because refusing CRYPTOGRAM_3DS would hide the button from
// many users, but a subscription funded by a device token may fail at its
// first renewal. That has to be proven in sandbox before this goes live —
// see PAYMENTS.md.

const SCRIPT = "https://pay.google.com/gp/p/js/pay.js";

export interface GooglePayOpaque { dataDescriptor: string; dataValue: string }
export interface GooglePayBilling {
  name?: string; address?: string; city?: string; state?: string; zip?: string; country?: string;
}
export interface GooglePayResult { opaque: GooglePayOpaque; billing: GooglePayBilling; email?: string }

declare global { interface Window { google?: any } }

export const googlePayMerchantId = (): string => process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID || "";

/** TEST needs no approval and returns dummy credentials — the default. */
const environment = (): "TEST" | "PRODUCTION" =>
  (process.env.NEXT_PUBLIC_GOOGLE_PAY_ENV || "TEST").toUpperCase() === "PRODUCTION" ? "PRODUCTION" : "TEST";

let scriptPromise: Promise<boolean> | null = null;
function loadScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.google?.payments?.api) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<boolean>((resolve) => {
    const el = document.createElement("script");
    el.src = SCRIPT;
    el.async = true;
    el.onload = () => resolve(!!window.google?.payments?.api);
    el.onerror = () => resolve(false);
    document.head.appendChild(el);
  });
  return scriptPromise;
}

function baseRequest(gatewayMerchantId: string) {
  return {
    apiVersion: 2,
    apiVersionMinor: 0,
    allowedPaymentMethods: [{
      type: "CARD",
      parameters: {
        allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
        allowedCardNetworks: ["AMEX", "DISCOVER", "MASTERCARD", "VISA"],
        // The wallet's address comes from the issuer, so it is better AVS
        // data than anything typed into our form.
        billingAddressRequired: true,
        billingAddressParameters: { format: "FULL", phoneNumberRequired: false },
      },
      tokenizationSpecification: {
        type: "PAYMENT_GATEWAY",
        parameters: { gateway: "authorizenet", gatewayMerchantId },
      },
    }],
  };
}

/**
 * Is Google Pay usable here? False on any doubt — a button that opens and
 * then fails is worse than no button.
 */
export async function googlePayAvailable(gatewayMerchantId: string): Promise<boolean> {
  if (!googlePayMerchantId() || !gatewayMerchantId) return false;
  try {
    if (!(await loadScript())) return false;
    const client = new window.google.payments.api.PaymentsClient({ environment: environment() });
    const res = await client.isReadyToPay(baseRequest(gatewayMerchantId));
    return !!res?.result;
  } catch {
    return false;
  }
}

/**
 * Open the sheet and return an Authorize.Net-shaped opaque token.
 *
 * Returns null when the user closes the sheet — a cancel is a choice, not an
 * error to surface.
 */
export async function payWithGoogle(opts: {
  gatewayMerchantId: string;
  amountCents: number;
  label: string;
}): Promise<GooglePayResult | null> {
  if (!(await loadScript())) throw new Error("Google Pay is unavailable right now.");
  const client = new window.google.payments.api.PaymentsClient({ environment: environment() });

  const request = {
    ...baseRequest(opts.gatewayMerchantId),
    merchantInfo: { merchantId: googlePayMerchantId(), merchantName: "CrimeAI" },
    transactionInfo: {
      totalPriceStatus: "FINAL",
      totalPrice: (opts.amountCents / 100).toFixed(2),
      currencyCode: "USD",
      countryCode: "US",
      totalPriceLabel: opts.label,
    },
    emailRequired: true,
  };

  let data: any;
  try {
    data = await client.loadPaymentData(request);
  } catch (e: any) {
    if (e?.statusCode === "CANCELED") return null;
    throw new Error(e?.statusMessage || "Google Pay didn't complete.");
  }

  const token = data?.paymentMethodData?.tokenizationData?.token;
  if (!token) throw new Error("Google Pay returned no payment token.");

  const a = data?.paymentMethodData?.info?.billingAddress || {};
  return {
    // Authorize.Net expects the gateway token base64-encoded in dataValue.
    opaque: {
      dataDescriptor: "COMMON.GOOGLE.INAPP.PAYMENT",
      dataValue: typeof btoa === "function" ? btoa(token) : token,
    },
    billing: {
      name: a.name || undefined,
      address: [a.address1, a.address2].filter(Boolean).join(" ") || undefined,
      city: a.locality || undefined,
      state: a.administrativeArea || undefined,
      zip: a.postalCode || undefined,
      country: a.countryCode || undefined,
    },
    email: data?.email || undefined,
  };
}
