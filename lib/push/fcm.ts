// FCM sender (Android) — HTTP v1 API, no SDK dependency.
//
// FCM v1 needs an OAuth2 access token minted from a Google service-account
// JSON key (RS256 JWT → token endpoint). We cache the access token for its
// lifetime (Google issues 1h; we refresh at 50m).
//
// DORMANT-SAFE: without FCM_SERVICE_ACCOUNT_JSON this no-ops and reports
// { sent:false, skipped } — same pattern as the APNs, Resend and Twilio
// adapters, so the delivery path ships before the Firebase project exists.

import { createSign } from "node:crypto";
import type { PushResult } from "./apns";

interface ServiceAccount { client_email: string; private_key: string; project_id: string }

export function fcmConfigured(): boolean {
  return !!process.env.FCM_SERVICE_ACCOUNT_JSON;
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    if (!sa.client_email || !sa.private_key || !sa.project_id) return null;
    return { ...sa, private_key: String(sa.private_key).replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

let tokenCache: { at: number; token: string } | null = null;
const TOKEN_TTL_MS = 50 * 60_000;
export function _resetFcmToken() { tokenCache = null; }

const b64url = (i: Buffer | string) => Buffer.from(i).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function accessToken(): Promise<string | null> {
  if (tokenCache && Date.now() - tokenCache.at < TOKEN_TTL_MS) return tokenCache.token;
  const sa = serviceAccount();
  if (!sa) return null;

  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat, exp: iat + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data: any = await res.json().catch(() => ({}));
  if (!data.access_token) return null;
  tokenCache = { at: Date.now(), token: data.access_token };
  return data.access_token;
}

export async function sendFcm(
  deviceToken: string,
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<PushResult> {
  const sa = serviceAccount();
  if (!sa) return { sent: false, skipped: "fcm not configured" };
  try {
    const token = await accessToken();
    if (!token) return { sent: false, error: "fcm auth failed" };
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: payload.title, body: payload.body },
          // FCM data values must be strings
          data: Object.fromEntries(Object.entries(payload.data || {}).map(([k, v]) => [k, String(v)])),
          android: { priority: "HIGH" },
        },
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (res.ok) return { sent: true };
    const body = await res.text().catch(() => "");
    const dead = res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(body);
    return { sent: false, error: `fcm ${res.status} ${body.slice(0, 120)}`, deadToken: dead };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}
