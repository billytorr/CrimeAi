"use client";

// Product analytics + feedback pipe to the Command Center.
// Fire-and-forget: never blocks or breaks the UX, no-ops in offline
// demo mode. Events land in the `events` table (admin-only reads).
import { supabase, supabaseEnabled } from "./supabase";

export type EventName =
  | "app_open" | "tab_view" | "post_create" | "like" | "comment" | "follow"
  | "dm_send" | "sos_open" | "live_start" | "search" | "report_create" | "profile_view" | "repost"
  | "push_registered" | "push_register_failed";

export function track(name: EventName, props: Record<string, unknown> = {}): void {
  if (!supabaseEnabled) return;
  (async () => {
    try {
      const { data } = await supabase!.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return; // only track signed-in users
      await supabase!.from("events").insert({ user_id: uid, name, props });
    } catch { /* analytics must never surface errors */ }
  })();
}

export async function sendFeedback(category: string, message: string, author: string): Promise<void> {
  if (!supabaseEnabled) return; // demo mode: accept silently
  const { data } = await supabase!.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error("Sign in to send feedback.");
  const { error } = await supabase!.from("feedback").insert({ user_id: uid, author, category, message });
  if (error) throw new Error(error.message);
}

export interface Announcement { id: string; title: string; body: string; published_at: string }
export async function getAnnouncements(): Promise<Announcement[]> {
  if (!supabaseEnabled) return [];
  const { data } = await supabase!
    .from("announcements").select("id, title, body, published_at")
    .eq("status", "published").order("published_at", { ascending: false }).limit(20);
  return (data || []) as Announcement[];
}
