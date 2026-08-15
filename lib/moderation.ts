"use client";

// User-facing safety controls required by the app stores (Apple 1.2 UGC):
// report offensive content, block abusive users, delete your account.
import { supabase, supabaseEnabled } from "./supabase";

export const REPORT_REASONS = [
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "false_report", label: "False crime report" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "violence", label: "Violence or dangerous act" },
  { id: "spam", label: "Spam or scam" },
  { id: "other", label: "Something else" },
];

export async function reportPost(postId: string, reporterId: string, reason: string, detail = ""): Promise<void> {
  if (!supabaseEnabled) return;
  const { error } = await supabase!.from("content_reports").insert({ post_id: postId, reporter_id: reporterId, reason, detail });
  if (error) throw new Error(error.message);
}

export async function blockUser(blockerId: string, handle: string): Promise<void> {
  if (!supabaseEnabled) {
    const s = new Set<string>(JSON.parse(localStorage.getItem("pscc_blocks") || "[]"));
    s.add(handle);
    localStorage.setItem("pscc_blocks", JSON.stringify([...s]));
    return;
  }
  await supabase!.from("blocks").upsert({ blocker_id: blockerId, blocked_handle: handle });
}

export async function unblockUser(blockerId: string, handle: string): Promise<void> {
  if (!supabaseEnabled) {
    const s = new Set<string>(JSON.parse(localStorage.getItem("pscc_blocks") || "[]"));
    s.delete(handle);
    localStorage.setItem("pscc_blocks", JSON.stringify([...s]));
    return;
  }
  await supabase!.from("blocks").delete().eq("blocker_id", blockerId).eq("blocked_handle", handle);
}

export async function getBlockedHandles(blockerId?: string): Promise<Set<string>> {
  if (!supabaseEnabled || !blockerId) {
    try { return new Set(JSON.parse(localStorage.getItem("pscc_blocks") || "[]")); } catch { return new Set(); }
  }
  const { data } = await supabase!.from("blocks").select("blocked_handle").eq("blocker_id", blockerId);
  return new Set((data || []).map((b) => b.blocked_handle));
}

// In-app account deletion (Apple 5.1.1(v)): server-side cascade wipes
// profile, posts, likes, follows, comments, messages, events — everything.
export async function deleteMyAccount(): Promise<void> {
  if (!supabaseEnabled) {
    const key = localStorage.getItem("pscc_session");
    if (key) {
      const accounts = JSON.parse(localStorage.getItem("pscc_accounts") || "{}");
      delete accounts[key];
      localStorage.setItem("pscc_accounts", JSON.stringify(accounts));
      localStorage.removeItem("pscc_session");
    }
    return;
  }
  // Server route (not the RPC): it cancels any Authorize.Net ARB subscription
  // BEFORE deleting, so a deleted account can never keep getting charged. If
  // the cancel fails the server refuses to delete and we surface why.
  const { apiUrl, authHeaders } = await import("./api");
  const res = await fetch(apiUrl("/api/me/delete"), { method: "POST", headers: { ...(await authHeaders()) } });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(data?.error || "Couldn't delete your account — please try again.");
  await supabase!.auth.signOut().catch(() => {});
}
