// Minimal Authorize.Net JSON client. Their JSON is translated XML, so
// element ORDER matters — every request builder here emits keys in the
// documented order. merchantAuthentication is injected as the first field.
//
// Rule 8: card data (PAN/CVV/expiry) NEVER passes through here. Only the
// Accept.js opaqueData nonce and customer-profile references do. Nothing
// in this module logs a request body.
import { anetApiUrl, anetSecret } from "./env";

export interface AnetResult<T = any> {
  ok: boolean;
  resultCode: string;   // "Ok" | "Error"
  code?: string;        // first message code (e.g. "I00001", "E00027")
  text?: string;        // first message text
  raw: T;
}

// wrapperKey is the single root element, e.g. "ARBCreateSubscriptionRequest".
// body is everything inside it EXCEPT merchantAuthentication (added here).
export async function anetPost<T = any>(wrapperKey: string, body: Record<string, unknown>): Promise<AnetResult<T>> {
  const { apiLoginId, transactionKey } = anetSecret();
  const payload = {
    [wrapperKey]: {
      merchantAuthentication: { name: apiLoginId, transactionKey },
      ...body,
    },
  };

  const res = await fetch(anetApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });

  // Authorize.Net responses can carry a UTF-8 BOM that breaks JSON.parse.
  const text = (await res.text()).replace(/^﻿/, "").trim();
  let raw: any;
  try { raw = JSON.parse(text); } catch { throw new Error("Authorize.Net returned a non-JSON response"); }

  const messages = raw?.messages;
  const resultCode: string = messages?.resultCode || "Error";
  const first = Array.isArray(messages?.message) ? messages.message[0] : messages?.message;
  return {
    ok: resultCode === "Ok",
    resultCode,
    code: first?.code,
    text: first?.text,
    raw,
  };
}
