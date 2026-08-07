// APNs sender — token-based auth, HTTP/2.
//
// ⚠️ APNs IS HTTP/2-ONLY. api.push.apple.com refuses HTTP/1.1 outright, and
// Node's built-in fetch() (undici) speaks only HTTP/1.1 — it fails with
// "Response does not match the HTTP/1.1 protocol" before a request is even
// sent. So this uses node:http2 directly. Do not "simplify" it back to
// fetch(): it will fail 100% of the time, and it fails as a *network* error
// rather than an HTTP status, which looks like a credential problem.
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
import { connect, constants, type ClientHttp2Session } from "node:http2";

export interface PushResult { sent: boolean; skipped?: string; error?: string; deadToken?: boolean }

export function apnsConfigured(): boolean {
  return !!(process.env.APNS_KEY_P8 && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID);
}

function apnsHost(environment: string): string {
  // sandbox = development builds (Xcode debug), production = TestFlight/App Store
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

// ── HTTP/2 session reuse ────────────────────────────────────────────────
// One TLS+H2 handshake per notification would dominate the cost of a fan-out
// to hundreds of devices, so sessions are cached per host and reused for as
// long as the serverless instance stays warm. Any error, close or GOAWAY
// evicts the entry so the next send reconnects cleanly.
const sessions = new Map<string, ClientHttp2Session>();

function getSession(origin: string): ClientHttp2Session {
  const existing = sessions.get(origin);
  if (existing && !existing.closed && !existing.destroyed) return existing;

  const session = connect(origin);
  const evict = () => { if (sessions.get(origin) === session) sessions.delete(origin); };
  session.on("error", evict);
  session.on("close", evict);
  session.on("goaway", evict);
  // Nothing else keeps the event loop alive for this socket between requests.
  session.setTimeout(60_000, () => { evict(); session.close(); });
  sessions.set(origin, session);
  return session;
}

/** Close pooled sessions — used by the diagnostic so a probe leaves nothing behind. */
export function _closeApnsSessions(): void {
  for (const [, s] of sessions) { try { s.close(); } catch { /* already gone */ } }
  sessions.clear();
}

interface H2Response { status: number; body: string }

function h2Post(origin: string, path: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<H2Response> {
  return new Promise((resolve, reject) => {
    let session: ClientHttp2Session;
    try { session = getSession(origin); } catch (e) { return reject(e); }

    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    // A session-level failure (TLS, DNS, GOAWAY) never reaches req's error
    // handler, so it has to be caught here or the promise hangs to timeout.
    const onSessionError = (e: Error) => finish(() => reject(e));
    session.once("error", onSessionError);

    const req = session.request({
      [constants.HTTP2_HEADER_METHOD]: "POST",
      [constants.HTTP2_HEADER_PATH]: path,
      ...headers,
    });

    let status = 0;
    let data = "";
    req.setEncoding("utf8");
    req.setTimeout(timeoutMs, () => finish(() => { req.close(constants.NGHTTP2_CANCEL); reject(new Error("apns request timed out")); }));
    req.on("response", (h) => { status = Number(h[constants.HTTP2_HEADER_STATUS]) || 0; });
    req.on("data", (c) => { data += c; });
    req.on("error", (e) => finish(() => { session.off("error", onSessionError); reject(e); }));
    req.on("end", () => finish(() => { session.off("error", onSessionError); resolve({ status, body: data }); }));

    req.end(body);
  });
}

export async function sendApns(
  deviceToken: string,
  payload: { title: string; body: string; data?: Record<string, unknown>; sound?: string; threadId?: string },
  environment: "production" | "sandbox" = "production",
): Promise<PushResult> {
  if (!apnsConfigured()) return { sent: false, skipped: "apns not configured" };
  try {
    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: payload.sound ?? "default",
        ...(payload.threadId ? { "thread-id": payload.threadId } : {}),
      },
      ...(payload.data || {}),
    });

    const res = await h2Post(
      apnsHost(environment),
      `/3/device/${deviceToken}`,
      {
        authorization: `bearer ${buildApnsJwt()}`,
        "apns-topic": process.env.APNS_BUNDLE_ID!,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body,
      10_000,
    );

    if (res.status === 200) return { sent: true };
    // 410 Gone / BadDeviceToken → the token is dead and should be disabled
    const dead = res.status === 410 || /BadDeviceToken|Unregistered/i.test(res.body);
    return { sent: false, error: `apns ${res.status} ${res.body.slice(0, 120)}`, deadToken: dead };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}
