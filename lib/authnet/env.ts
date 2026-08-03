// Authorize.Net environment resolution. ONE variable — AUTHNET_ENV —
// flips every URL between sandbox and production. The keys themselves are
// environment-specific (sandbox keys only work against sandbox), so the
// flag and the credential values always move together.
export type AnetEnv = "sandbox" | "production";

export function anetEnv(): AnetEnv {
  return (process.env.AUTHNET_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
}

// Server-to-server API endpoint (charges, ARB, customer profiles, reporting).
export function anetApiUrl(): string {
  return anetEnv() === "production"
    ? "https://api.authorize.net/xml/v1/request.api"
    : "https://apitest.authorize.net/xml/v1/request.api";
}

// Accept.js library the browser loads to tokenize the card (card data never
// reaches our server — Rule 8).
export function anetAcceptJsUrl(): string {
  return anetEnv() === "production"
    ? "https://js.authorize.net/v1/Accept.js"
    : "https://jstest.authorize.net/v1/Accept.js";
}

// Non-secret merchant identity + public client key (safe in the browser).
export function anetPublic() {
  return {
    env: anetEnv(),
    apiLoginId: process.env.AUTHNET_API_LOGIN_ID || "",
    clientKey: process.env.NEXT_PUBLIC_AUTHNET_CLIENT_KEY || "",
    acceptJsUrl: anetAcceptJsUrl(),
  };
}

// Server-only secrets. Never sent to the browser, never logged.
export function anetSecret() {
  const apiLoginId = process.env.AUTHNET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHNET_TRANSACTION_KEY;
  if (!apiLoginId || !transactionKey) throw new Error("Authorize.Net credentials not configured");
  return { apiLoginId, transactionKey };
}

// Card-statement descriptor (Rule: recognizable descriptor). Config-driven.
export function statementDescriptor(): string {
  return (process.env.AUTHNET_DESCRIPTOR || "PSCC-CRIMEAI PRO PLAN").slice(0, 22);
}
