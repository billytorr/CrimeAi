// Push credential self-test.
//
// THE POINT: you can prove APNs and FCM credentials are correct WITHOUT any
// device, any build, or any TestFlight round-trip. Send to a deliberately
// fake device token and read which error comes back:
//
//   403 InvalidProviderToken  → the .p8 / key ID / team ID do not agree
//   400 BadTopic              → the bundle ID is wrong
//   400 BadDeviceToken        → ✅ Apple ACCEPTED your JWT and rejected only
//                                 the fake token. Credentials are good.
//
// That last one is the whole trick: the failure we *want* is a token failure,
// because reaching a token failure means auth already succeeded.
//
// This exercises the real sendApns/sendFcm code paths rather than a parallel
// implementation, so a pass here is a pass for production traffic.

import { sendApns, apnsConfigured, _resetApnsJwt, buildApnsJwt, _closeApnsSessions } from "./apns";
import { sendFcm, fcmConfigured, _resetFcmToken, lastFcmAuthError } from "./fcm";

// Syntactically valid (64 hex chars) but guaranteed unregistered. Apple
// rejects it at the token stage, which is exactly the stage we want to reach.
export const FAKE_APNS_TOKEN = "0".repeat(64);
export const FAKE_FCM_TOKEN = "diagnostic-invalid-token";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

/** Map an APNs probe result to a verdict. Pure — unit-tested. */
export function interpretApns(error: string | undefined, sent: boolean): Check {
  const name = "APNs credentials";
  if (sent) {
    // Can't happen with a fake token, but never claim failure on a success.
    return { ok: true, name, detail: "Apple accepted the push outright" };
  }
  const e = error || "";
  const has = (s: string) => new RegExp(s, "i").test(e);

  if (has("BadDeviceToken|Unregistered")) {
    return {
      ok: true, name,
      detail: "Apple accepted the JWT and rejected only the fake device token — this is the expected pass",
    };
  }
  if (has("InvalidProviderToken")) {
    return {
      ok: false, name,
      detail: "Apple rejected the signing token (403 InvalidProviderToken)",
      fix: "APNS_KEY_P8, APNS_KEY_ID and APNS_TEAM_ID do not agree. Most common cause: the key is a Sign-in-with-Apple key, not one with the APNs capability ticked. Second most common: KEY_ID is not the ID of the key whose .p8 you pasted.",
    };
  }
  if (has("ExpiredProviderToken")) {
    return { ok: false, name, detail: "Apple says the signing token is expired", fix: "Server clock skew, or a cached JWT older than 60 minutes." };
  }
  if (has("MissingProviderToken")) {
    return { ok: false, name, detail: "No authorization header reached Apple", fix: "APNS_KEY_P8 is set but empty or unreadable." };
  }
  if (has("BadTopic|TopicDisallowed|DeviceTokenNotForTopic")) {
    return {
      ok: false, name,
      detail: "The JWT was fine but Apple rejected the topic",
      fix: "APNS_BUNDLE_ID must be exactly com.pscc.crimeai and must belong to the same team as APNS_TEAM_ID.",
    };
  }
  if (has("MissingTopic")) {
    return { ok: false, name, detail: "No apns-topic header", fix: "APNS_BUNDLE_ID is unset." };
  }
  if (has("Forbidden|403")) {
    return { ok: false, name, detail: e, fix: "Auth was rejected. Re-check the key, key ID and team ID." };
  }
  if (has("apns 5\\d\\d")) {
    return { ok: false, name, detail: e, fix: "Apple-side error. Retry in a few minutes — not a config problem." };
  }
  if (has("not configured")) {
    return { ok: false, name, detail: "APNs is dormant", fix: "Set APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID in Vercel and redeploy." };
  }
  return { ok: false, name, detail: e || "no response", fix: "Unrecognised APNs response — paste this detail back and I'll decode it." };
}

/** Map an FCM probe result to a verdict. Pure — unit-tested. */
export function interpretFcm(error: string | undefined, sent: boolean, authError?: string | null): Check {
  const name = "FCM credentials";
  if (sent) return { ok: true, name, detail: "FCM accepted the push outright" };
  const e = error || "";
  const has = (s: string) => new RegExp(s, "i").test(e);

  if (has("INVALID_ARGUMENT|UNREGISTERED|not a valid FCM registration token|fcm 404")) {
    return {
      ok: true, name,
      detail: "Google accepted the service-account token and rejected only the fake device token — this is the expected pass",
    };
  }
  if (has("auth failed") || has("fcm 401")) {
    return {
      ok: false, name,
      detail: authError || "Could not mint a Google access token",
      fix: "FCM_SERVICE_ACCOUNT_JSON is wrong. Paste the downloaded JSON whole and unedited — flattening the \\n inside private_key is the usual cause.",
    };
  }
  if (has("SERVICE_DISABLED|PERMISSION_DENIED|fcm 403")) {
    return {
      ok: false, name,
      detail: "Google authenticated the key but refused the send",
      fix: "Enable Firebase Cloud Messaging API (V1) in the Firebase console under Project settings → Cloud Messaging, and confirm the service account belongs to project crimeai-app.",
    };
  }
  if (has("not configured")) {
    return { ok: false, name, detail: "FCM is dormant", fix: "Set FCM_SERVICE_ACCOUNT_JSON in Vercel and redeploy." };
  }
  return { ok: false, name, detail: e || "no response", fix: "Unrecognised FCM response — paste this detail back and I'll decode it." };
}

/** Does the .p8 actually parse and sign? Catches a mangled paste before any network call. */
export function checkApnsKeyParses(): Check {
  const name = "APNs key parses";
  if (!apnsConfigured()) {
    return { ok: false, name, detail: "one or more APNS_* vars are unset", fix: "All four are required: APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID." };
  }
  try {
    _resetApnsJwt();
    const jwt = buildApnsJwt();
    _resetApnsJwt();
    const parts = jwt.split(".");
    if (parts.length !== 3) return { ok: false, name, detail: "signed token is malformed" };
    return { ok: true, name, detail: "ES256 signature produced from the .p8" };
  } catch (e) {
    return {
      ok: false, name,
      detail: (e as Error).message,
      fix: "APNS_KEY_P8 is not a readable EC private key. Paste the whole file including the BEGIN/END lines. Real newlines or \\n-escaped both work; anything else does not.",
    };
  }
}

export interface Diagnosis {
  apns: { configured: boolean; keyId?: string; teamId?: string; bundleId?: string; checks: Check[] };
  fcm: { configured: boolean; projectId?: string; clientEmail?: string; checks: Check[] };
  triggers: { endpointSecretSet: boolean; checks: Check[] };
  ok: boolean;
}

export async function diagnose(): Promise<Diagnosis> {
  const checks: Check[] = [];

  // ---- APNs -------------------------------------------------------------
  const apnsChecks: Check[] = [];
  const parseCheck = checkApnsKeyParses();
  apnsChecks.push(parseCheck);
  if (parseCheck.ok) {
    // Probe both hosts. With a fake token both must reach the token stage;
    // if only one does, the key is environment-scoped and that is worth knowing.
    for (const env of ["production", "sandbox"] as const) {
      _resetApnsJwt();
      const r = await sendApns(FAKE_APNS_TOKEN, { title: "diagnostic", body: "credential probe" }, env);
      const c = interpretApns(r.error, r.sent);
      apnsChecks.push({ ...c, name: `${c.name} (${env})` });
    }
    _resetApnsJwt();
    // A probe opens an HTTP/2 session to each Apple host; don't leave them
    // pooled in the instance just because someone ran a diagnostic.
    _closeApnsSessions();
  }

  // ---- FCM --------------------------------------------------------------
  const fcmChecks: Check[] = [];
  if (!fcmConfigured()) {
    fcmChecks.push({ ok: false, name: "FCM credentials", detail: "FCM is dormant", fix: "Set FCM_SERVICE_ACCOUNT_JSON in Vercel and redeploy." });
  } else {
    _resetFcmToken();
    const r = await sendFcm(FAKE_FCM_TOKEN, { title: "diagnostic", body: "credential probe" });
    fcmChecks.push(interpretFcm(r.error, r.sent, lastFcmAuthError()));
    _resetFcmToken();
  }

  // ---- Triggers ---------------------------------------------------------
  const triggerChecks: Check[] = [{
    ok: !!process.env.PUSH_EVENT_SECRET,
    name: "Trigger secret",
    detail: process.env.PUSH_EVENT_SECRET ? "PUSH_EVENT_SECRET is set" : "PUSH_EVENT_SECRET is unset — database triggers cannot call in",
    fix: process.env.PUSH_EVENT_SECRET ? undefined : "Set it in Vercel, then insert the matching push_endpoint / push_secret rows into app_settings.",
  }];

  let sa: any = null;
  try { sa = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON || "null"); } catch { /* reported by the check above */ }

  checks.push(...apnsChecks, ...fcmChecks, ...triggerChecks);
  return {
    // Identifiers only — never the .p8 or the private_key.
    apns: {
      configured: apnsConfigured(),
      keyId: process.env.APNS_KEY_ID,
      teamId: process.env.APNS_TEAM_ID,
      bundleId: process.env.APNS_BUNDLE_ID,
      checks: apnsChecks,
    },
    fcm: {
      configured: fcmConfigured(),
      projectId: sa?.project_id,
      clientEmail: sa?.client_email,
      checks: fcmChecks,
    },
    triggers: { endpointSecretSet: !!process.env.PUSH_EVENT_SECRET, checks: triggerChecks },
    ok: checks.every((c) => c.ok),
  };
}
