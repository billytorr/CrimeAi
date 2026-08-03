// Authorize.Net webhook signature verification. Every webhook is verified
// before we trust a single byte of it — an unverified endpoint is how
// anyone on the internet could grant themselves a paid subscription.
//
// Authorize.Net sends header  X-ANET-Signature: sha512=<UPPERCASE_HEX>
// which is HMAC-SHA512 of the RAW request body keyed with the Signature Key.
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(rawBody: string, header: string | null, signatureKey?: string): boolean {
  const key = signatureKey || process.env.AUTHNET_SIGNATURE_KEY;
  if (!key || !header) return false;

  // header is "sha512=<hex>"; be tolerant of the prefix/casing
  const provided = header.includes("=") ? header.split("=").pop()! : header;
  const expected = createHmac("sha512", key).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(provided.toLowerCase(), "utf8");
  const b = Buffer.from(expected.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
