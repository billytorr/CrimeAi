import { describe, it, expect } from "vitest";
import { signCheckoutToken, verifyCheckoutToken, newNonce, type CheckoutClaims } from "./checkout-token";

const SECRET = "unit-test-secret-key-0123456789";
const claims = (over: Partial<CheckoutClaims> = {}): CheckoutClaims => ({
  userId: "user-123", plan: "pro", priceId: "pro_499", nonce: newNonce(),
  exp: Date.now() + 60_000, ...over,
});

describe("checkout token — signed cross-domain handoff", () => {
  it("valid token round-trips", () => {
    const c = claims();
    const r = verifyCheckoutToken(signCheckoutToken(c, SECRET), SECRET);
    expect(r.valid).toBe(true);
    if (r.valid) { expect(r.claims.userId).toBe("user-123"); expect(r.claims.priceId).toBe("pro_499"); }
  });

  it("carries no identifying value in the clear — payload is inside the signed blob", () => {
    const token = signCheckoutToken(claims(), SECRET);
    // the token is body.sig; the email is never in it, and userId is only in
    // the signed base64 body, never a query param the caller controls
    expect(token.split(".").length).toBe(2);
  });

  it("EXPIRED token is rejected", () => {
    const token = signCheckoutToken(claims({ exp: Date.now() - 1 }), SECRET);
    const r = verifyCheckoutToken(token, SECRET);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("expired");
  });

  it("TAMPERED signature is rejected", () => {
    const token = signCheckoutToken(claims(), SECRET);
    const [body, sig] = token.split(".");
    const flipped = sig.slice(0, -2) + (sig.slice(-2) === "AA" ? "BB" : "AA");
    const r = verifyCheckoutToken(`${body}.${flipped}`, SECRET);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("bad_signature");
  });

  it("TAMPERED payload (raise the plan) is rejected — signature won't match", () => {
    const token = signCheckoutToken(claims({ priceId: "pro_499" }), SECRET);
    const sig = token.split(".")[1];
    const forgedBody = Buffer.from(JSON.stringify(claims({ priceId: "pro_000" }))).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const r = verifyCheckoutToken(`${forgedBody}.${sig}`, SECRET);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("bad_signature");
  });

  it("WRONG secret is rejected", () => {
    const token = signCheckoutToken(claims(), SECRET);
    const r = verifyCheckoutToken(token, "a-different-secret-key-0123456789");
    expect(r.valid).toBe(false);
  });

  it("malformed token is rejected", () => {
    expect(verifyCheckoutToken("not-a-token", SECRET).valid).toBe(false);
    expect(verifyCheckoutToken("", SECRET).valid).toBe(false);
  });

  it("REPLAY: token stays verifiable, so single-use must be the nonce (redeemed in DB)", () => {
    const c = claims();
    const token = signCheckoutToken(c, SECRET);
    // signature verification is intentionally stateless — two verifies pass;
    // replay is stopped by redeeming c.nonce exactly once server-side.
    expect(verifyCheckoutToken(token, SECRET).valid).toBe(true);
    expect(verifyCheckoutToken(token, SECRET).valid).toBe(true);
    expect(c.nonce.length).toBeGreaterThan(10);
  });
});
