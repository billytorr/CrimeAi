// Push delivery orchestrator.
//
// Fans a notification out to a user's registered devices, honouring their
// alert_channels.push preference, deduping by event key, and disabling dead
// tokens the provider rejects.
//
// ⚠️ RULE 1 — safety dispatch: `sendPush` takes NO tier, score, entitlement
// or identity input and performs no such lookup. `kind: "safety"` also
// bypasses the user's push preference, because an emergency must reach a
// device even if the user muted routine alerts. Nothing in this file can be
// gated by a billing or scoring failure.

import { sendApns, type PushResult } from "./apns";
import { sendFcm } from "./fcm";

export type PushKind = "alert" | "safety" | "system";

export interface PushMessage {
  title: string;
  body: string;
  kind: PushKind;
  data?: Record<string, unknown>;
  /** one delivery per user per event; repeated calls are skipped */
  dedupeKey?: string;
}

export interface FanoutResult { attempted: number; sent: number; skipped: number; failed: number; disabled: number }

export async function sendPush(userId: string, msg: PushMessage): Promise<FanoutResult> {
  const out: FanoutResult = { attempted: 0, sent: 0, skipped: 0, failed: 0, disabled: 0 };
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);

  // Preference check — routine alerts respect it, SAFETY never does.
  if (msg.kind !== "safety") {
    const { data: prof } = await db.from("profiles").select("alert_channels").eq("id", userId).maybeSingle();
    const channels = (prof?.alert_channels || {}) as Record<string, boolean>;
    if (channels.push === false) { out.skipped++; return out; }
  }

  // Dedupe: a unique index on (user_id, dedupe_key) where status='sent'
  // makes a duplicate insert fail, so we check before fanning out.
  if (msg.dedupeKey) {
    const { data: dup } = await db.from("push_deliveries")
      .select("id").eq("user_id", userId).eq("dedupe_key", msg.dedupeKey).eq("status", "sent").maybeSingle();
    if (dup) { out.skipped++; return out; }
  }

  const { data: tokens } = await db.from("device_tokens")
    .select("token, platform, environment").eq("user_id", userId).is("disabled_at", null);
  if (!tokens?.length) { out.skipped++; return out; }

  for (const t of tokens) {
    out.attempted++;
    let r: PushResult;
    if (t.platform === "ios") {
      const primary = (t.environment as "production" | "sandbox") || "production";
      r = await sendApns(t.token, msg, primary);
      // A token minted against the OTHER APNs environment fails with exactly
      // the same BadDeviceToken as a genuinely dead one — and the client
      // cannot tell a debug build from a release build to label it correctly.
      // So before believing a token is dead, try the other host; if that
      // works, persist the correction so we get it right first time after.
      // Without this, every debug build's token is disabled on first send.
      if (!r.sent && r.deadToken) {
        const alt = primary === "production" ? "sandbox" : "production";
        const retry = await sendApns(t.token, msg, alt);
        if (retry.sent) {
          await db.from("device_tokens").update({ environment: alt }).eq("token", t.token);
          r = retry;
        }
      }
    }
    else if (t.platform === "android") r = await sendFcm(t.token, msg);
    else r = { sent: false, skipped: "web push not implemented" };

    if (r.sent) out.sent++;
    else if (r.skipped) out.skipped++;
    else out.failed++;

    if (r.deadToken) {
      await db.from("device_tokens").update({ disabled_at: new Date().toISOString() }).eq("token", t.token);
      out.disabled++;
    }

    await db.from("push_deliveries").insert({
      user_id: userId, token: t.token, kind: msg.kind,
      dedupe_key: msg.dedupeKey ?? null,
      status: r.sent ? "sent" : r.skipped ? "skipped" : "failed",
      error: r.error ?? r.skipped ?? null,
    });
  }
  return out;
}

// Convenience for the eventual alert fan-out: send one message to many users.
export async function sendPushToMany(userIds: string[], msg: PushMessage): Promise<FanoutResult> {
  const total: FanoutResult = { attempted: 0, sent: 0, skipped: 0, failed: 0, disabled: 0 };
  for (const id of userIds) {
    const r = await sendPush(id, msg);
    total.attempted += r.attempted; total.sent += r.sent;
    total.skipped += r.skipped; total.failed += r.failed; total.disabled += r.disabled;
  }
  return total;
}
