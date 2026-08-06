// Event → notification mapping. Pure decision logic where possible so the
// routing rules are unit-testable without a database.
//
// Rules encoded here:
//  • never notify someone about their own action
//  • per-type user preference (profiles.push_types), with alert_channels.push
//    as the master switch (applied downstream in sendPush)
//  • nearby-report alerts respect the user's radius and severity floor
//  • dedupe key per event so retries/duplicates deliver once

export type PushEventType = "comment" | "like" | "message" | "follow" | "corroboration" | "post" | "announcement";

export interface NotificationPlan {
  /** users to notify */
  recipients: string[];
  title: string;
  body: string;
  /** maps to profiles.push_types; "safety" bypasses preferences entirely */
  prefKey: string;
  kind: "alert" | "safety" | "system";
  dedupeKey: string;
  data?: Record<string, unknown>;
}

const trim = (s: string, n = 80) => (s || "").length > n ? `${s.slice(0, n - 1)}…` : (s || "");

// Severity at or above this is treated as a safety-critical alert, which
// bypasses the routine-alert preference (it does NOT bypass anything else —
// no tier, score or identity check exists anywhere in this path).
export const CRITICAL_SEVERITY = 4;

export function planComment(rec: { post_id: string; user_id: string; author: string; text: string; id: string }, postOwner: string): NotificationPlan | null {
  if (!postOwner || postOwner === rec.user_id) return null;   // never self-notify
  return {
    recipients: [postOwner],
    title: `${rec.author} commented`,
    body: trim(rec.text),
    prefKey: "comment",
    kind: "alert",
    dedupeKey: `comment:${rec.id}`,
    data: { postId: rec.post_id, type: "comment" },
  };
}

export function planLike(rec: { post_id: string; user_id: string }, postOwner: string, likerName: string, likeCount: number): NotificationPlan | null {
  if (!postOwner || postOwner === rec.user_id) return null;
  // Milestone-only after the first few, so a popular post doesn't spam.
  const milestone = likeCount <= 3 || likeCount === 10 || likeCount === 50 || likeCount === 100 || likeCount % 500 === 0;
  if (!milestone) return null;
  return {
    recipients: [postOwner],
    title: likeCount <= 3 ? `${likerName} liked your post` : `${likeCount} people liked your post`,
    body: "",
    prefKey: "like",
    kind: "alert",
    dedupeKey: `like:${rec.post_id}:${likeCount}`,
    data: { postId: rec.post_id, type: "like" },
  };
}

export function planMessage(rec: { id: string; sender_id: string; recipient_id: string; text: string }, senderName: string): NotificationPlan | null {
  if (!rec.recipient_id || rec.recipient_id === rec.sender_id) return null;
  return {
    recipients: [rec.recipient_id],
    title: senderName || "New message",
    body: trim(rec.text),
    prefKey: "message",
    kind: "alert",
    dedupeKey: `message:${rec.id}`,
    data: { type: "message", from: rec.sender_id },
  };
}

export function planFollow(rec: { follower_id: string; target_handle: string; status: string }, targetUserId: string, followerName: string): NotificationPlan | null {
  if (!targetUserId || targetUserId === rec.follower_id) return null;
  const requested = rec.status !== "approved";
  return {
    recipients: [targetUserId],
    title: requested ? `${followerName} requested to follow you` : `${followerName} followed you`,
    body: "",
    prefKey: "follow",
    kind: "alert",
    dedupeKey: `follow:${rec.follower_id}:${rec.target_handle}`,
    data: { type: "follow" },
  };
}

export function planCorroboration(rec: { report_id: string; user_id: string }, reportOwner: string, corroboratorName: string): NotificationPlan | null {
  if (!reportOwner || reportOwner === rec.user_id) return null;
  return {
    recipients: [reportOwner],
    title: "Your report was confirmed",
    body: `${corroboratorName} saw it too`,
    prefKey: "corroboration",
    kind: "alert",
    dedupeKey: `corroboration:${rec.report_id}:${rec.user_id}`,
    data: { postId: rec.report_id, type: "corroboration" },
  };
}

// Nearby report → alert the neighbours who opted into that category/severity.
export function planNearbyReport(
  rec: { id: string; user_id: string; author: string; text: string; category: string; neighborhood: string },
  severity: number,
  recipients: string[],
): NotificationPlan | null {
  if (!recipients.length) return null;
  const critical = severity >= CRITICAL_SEVERITY;
  return {
    recipients: recipients.filter((r) => r !== rec.user_id),
    title: critical ? `⚠️ ${rec.category} reported nearby` : `${rec.category} reported nearby`,
    body: trim(rec.text || `Reported in ${rec.neighborhood || "your area"}`),
    prefKey: "report",
    // Critical incidents are safety-kind: they reach the device even if the
    // user muted routine alerts. No tier/score/identity check is involved.
    kind: critical ? "safety" : "alert",
    dedupeKey: `report:${rec.id}`,
    data: { postId: rec.id, type: "report", category: rec.category, severity },
  };
}

export function planNews(rec: { id: string; author: string; text: string }, recipients: string[]): NotificationPlan | null {
  if (!recipients.length) return null;
  return {
    recipients,
    title: rec.author || "CrimeAI news",
    body: trim(rec.text),
    prefKey: "news",
    kind: "alert",
    dedupeKey: `news:${rec.id}`,
    data: { postId: rec.id, type: "news" },
  };
}

export function planAnnouncement(rec: { id: string; title: string; body: string }, recipients: string[]): NotificationPlan | null {
  if (!recipients.length) return null;
  return {
    recipients,
    title: rec.title || "CrimeAI",
    body: trim(rec.body),
    prefKey: "news",
    kind: "system",
    dedupeKey: `announcement:${rec.id}`,
    data: { type: "announcement" },
  };
}
