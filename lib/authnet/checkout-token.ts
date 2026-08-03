// Signed, short-lived checkout token for the cross-domain handoff.
// The app and pay.publicsafetycrimecenter.com are different origins, so no
// session travels between them. The app mints this token; the checkout
// server verifies it before rendering. It carries NO raw user id/email in
// a query string — the whole payload is signed and opaque.
//
// Format (compact, URL-safe): base64url(JSON payload).base64url(HMAC-SHA256)
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export interface CheckoutClaims {
  userId: string;
  plan: string;      // "pro"
  priceId: string;   // the assigned A/B arm, e.g. "pro_499"
  nonce: string;     // single-use (redeemed server-side)
  exp: number;       // unix ms expiry (minutes out)
}

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlToBuf = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function secretOf(secret?: string): string {
  // Dedicated secret preferred; falls back to the service-role key so the
  // deployed app signs tokens without an extra env var during the sandbox
  // phase. Set a dedicated CHECKOUT_TOKEN_SECRET before production.
  const s = secret || process.env.CHECKOUT_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s || s.length < 16) throw new Error("checkout token secret is missing or too short");
  return s;
}

export function newNonce(): string {
  return b64url(randomBytes(18));
}

export function signCheckoutToken(claims: CheckoutClaims, secret?: string): string {
  const s = secretOf(secret);
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = b64url(createHmac("sha256", s).update(body).digest());
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { valid: true; claims: CheckoutClaims }
  | { valid: false; reason: "malformed" | "bad_signature" | "expired" };

// Verifies signature (constant-time) and expiry. Does NOT check the nonce —
// single-use is enforced separately by redeeming it against the DB, so the
// signature check stays pure and testable.
export function verifyCheckoutToken(token: string, secret?: string, now = Date.now()): VerifyResult {
  const s = secretOf(secret);
  const parts = (token || "").split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };
  const [body, sig] = parts;

  const expected = createHmac("sha256", s).update(body).digest();
  let given: Buffer;
  try { given = b64urlToBuf(sig); } catch { return { valid: false, reason: "malformed" }; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { valid: false, reason: "bad_signature" };
  }

  let claims: CheckoutClaims;
  try { claims = JSON.parse(b64urlToBuf(body).toString("utf8")); } catch { return { valid: false, reason: "malformed" }; }
  if (!claims || typeof claims.exp !== "number" || !claims.userId || !claims.priceId || !claims.nonce) {
    return { valid: false, reason: "malformed" };
  }
  if (now >= claims.exp) return { valid: false, reason: "expired" };
  return { valid: true, claims };
}
