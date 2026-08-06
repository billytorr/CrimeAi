// APNs sender — token-based auth (HTTP/2 JSON API), no SDK dependency.
//
// Apple's token auth wants a short-lived ES256 JWT signed with a .p8 key.
// We sign it with node:crypto and cache it (Apple requires refresh between
// 20 and 60 minutes; we use 45).
//
// DORMANT-SAFE: without APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID this
// no-ops and reports { sent:false, skipped } — the whole delivery path can
// ship and run before the key exists, exactly like the Resend and Twilio
// adapters.
//
// ⚠️ The key used for Sign in with Apple is NOT an APNs key. APNs needs a
// key with the "Apple Push Notifications service" capability enabled.

import { createSign } from "node:crypto";

export interface PushResult { sent: boolean; skipped?: string; error?: string; deadToken?: boolean }

export function apnsConfigured(): boolean {
  return !!(process.env.APNS_KEY_P8 && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID);
}

function apnsHost(environment: string): string {
  // sandbox = development builds (Xcode/TestFlight debug), production = App Store
  return environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
}

let jwtCache: { at: number; token: string } | null = null;
const JWT_TTL_MS = 45 * 60_000;
export function _resetApnsJwt() { jwtCache = null; }

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ES256 JWT: header.payload signed with the .p8 private key.
export function buildApnsJwt(now: number = Date.now()): string {
  if (jwtCache && now - jwtCache.at < JWT_TTL_MS) return jwtCache.token;
  const keyId = process.env.APNS_KEY_ID!;
  const teamId = process.env.APNS_TEAM_ID!;
  // env vars can't hold real newlines — accept the \n-escaped form too
  const pem = (process.env.APNS_KEY_P8 || "").replace(/\\n/g, "\n");

  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  // APNs wants the JOSE (r||s) form, which node emits with dsaEncoding
  const sig = signer.sign({ key: pem, dsaEncoding: "ieee-p1363" });
  const token = `${header}.${payload}.${base64url(sig)}`;
  jwtCache = { at: now, token };
  return token;
}

export async function sendApns(
  deviceToken: string,
  payload: { title: string; body: string; data?: Record<string, unknown>; sound?: string; threadId?: string },
  environment: "production" | "sandbox" = "production",
): Promise<PushResult> {
  if (!apnsConfigured()) return { sent: false, skipped: "apns not configured" };
  try {
    const res = await fetch(`${apnsHost(environment)}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${buildApnsJwt()}`,
        "apns-topic": process.env.APNS_BUNDLE_ID!,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        aps: {
          alert: { title: payload.title, body: payload.body },
          sound: payload.sound ?? "default",
          ...(payload.threadId ? { "thread-id": payload.threadId } : {}),
        },
        ...(payload.data || {}),
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (res.ok) return { sent: true };
    const body = await res.text().catch(() => "");
    // 410 Gone / BadDeviceToken → the token is dead and should be disabled
    const dead = res.status === 410 || /BadDeviceToken|Unregistered/i.test(body);
    return { sent: false, error: `apns ${res.status} ${body.slice(0, 120)}`, deadToken: dead };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}
