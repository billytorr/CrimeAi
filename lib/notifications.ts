"use client";

// In-app activity feed (Inbox → Activity).
//
// Returns rows in the EXACT shape the Activity tab already renders —
// { id, tone, cat, title, body, ts } — so the layout is untouched and these
// merge straight into the existing list alongside nearby-incident items.
//
// Separate from push: push_deliveries logs what was sent to a device. A user
// with notifications muted still has an activity feed, and a delivered push
// still needs a row here to be readable later.

import { supabase, supabaseEnabled } from "@/lib/supabase";

export interface ActivityItem {
  id: string;
  tone: "social" | "alert" | "system";
  cat?: string;
  title: string;
  body?: string;
  ts: string;
  read: boolean;
  kind: string;
  postId?: string;
}

/** Newest first. Returns [] on any failure — an empty feed beats a crash. */
export async function getActivity(limit = 50): Promise<ActivityItem[]> {
  if (!supabaseEnabled) return [];
  try {
    const { data, error } = await supabase!
      .from("notifications")
      .select("id, kind, title, body, tone, cat, post_id, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.id,
      tone: (r.tone === "alert" || r.tone === "system" ? r.tone : "social") as ActivityItem["tone"],
      cat: r.cat || undefined,
      title: r.title,
      body: r.body || undefined,
      ts: r.created_at,
      read: !!r.read_at,
      kind: r.kind,
      postId: r.post_id || undefined,
    }));
  } catch {
    return [];
  }
}

/** Badge count for the Activity tab. 0 on failure — never block the UI. */
export async function unreadActivityCount(): Promise<number> {
  if (!supabaseEnabled) return 0;
  try {
    const { data } = await supabase!.rpc("unread_notification_count");
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

/**
 * Mark read. Omit ids to clear everything — which is what opening the tab
 * does, matching how Instagram and TikTok behave: seeing the list is the
 * acknowledgement, not tapping each row.
 */
export async function markActivityRead(ids?: string[]): Promise<void> {
  if (!supabaseEnabled) return;
  try {
    await supabase!.rpc("mark_notifications_read", { p_ids: ids ?? null });
  } catch { /* a failed read-marker must never break the tab */ }
}
