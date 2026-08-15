// Native Sign in with Apple for the iOS shell (App Store Guideline 4).
//
// Presents Apple's own ASAuthorization sheet inside the app — no browser
// handoff — then exchanges the identity token with Supabase via
// signInWithIdToken. The nonce binds the token to this attempt: Apple gets the
// SHA-256 of a random nonce, Supabase gets the raw nonce and verifies the
// hash inside the token, so a replayed token from elsewhere is rejected.
//
// Only used on native iOS; web keeps the standard OAuth redirect (fine there —
// the browser IS the platform on web).

import { Capacitor } from "@capacitor/core";

export function isNativeIOS(): boolean {
  try { return Capacitor.getPlatform() === "ios"; } catch { return false; }
}

export function isNativePlatform(): boolean {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

function randomNonce(len = 32): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface AppleNativeResult {
  identityToken: string;
  rawNonce: string;
  fullName?: string;
}

// Throws with a readable message on cancel/failure so the auth screen can show
// an inline error instead of a dead spinner.
export async function nativeAppleSignIn(): Promise<AppleNativeResult> {
  const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
  const rawNonce = randomNonce();
  const hashed = await sha256Hex(rawNonce);
  const res = await SignInWithApple.authorize({
    clientId: "com.pscc.crimeai",
    redirectURI: "https://app.publicsafetycrimecenter.com", // unused by the native sheet, required by the option type
    scopes: "email name",
    nonce: hashed,
  });
  const identityToken = res?.response?.identityToken;
  if (!identityToken) throw new Error("Apple sign-in was cancelled.");
  const name = [res.response.givenName, res.response.familyName].filter(Boolean).join(" ").trim();
  return { identityToken, rawNonce, fullName: name || undefined };
}
