"use client";

// CrimeAI conversation threads. Persisted per user (supabase/ai-threads.sql).
//
// Multiple threads = a Protector feature; free users get one rolling thread.
// The data layer treats both the same — the gate is in the UI — so upgrading
// unlocks the drawer without any migration.
//
// Every function fails soft: a persistence hiccup must never lose the message
// the user is looking at on screen. The screen keeps its own in-memory copy;
// this layer is durability, not the source of truth mid-session.

import { supabase, supabaseEnabled } from "@/lib/supabase";

export interface AiThread {
  id: string;
  title: string;
  postId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  engine?: string;
  createdAt?: string;
}

export async function listThreads(userId: string, limit = 50): Promise<AiThread[]> {
  if (!supabaseEnabled || !userId) return [];
  try {
    const { data } = await supabase!
      .from("ai_threads")
      .select("id, title, post_id, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    return (data || []).map((r: any) => ({
      id: r.id, title: r.title, postId: r.post_id || undefined,
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  } catch { return []; }
}

export async function createThread(userId: string, title = "New chat", postId?: string): Promise<string | null> {
  if (!supabaseEnabled || !userId) return null;
  try {
    const { data, error } = await supabase!
      .from("ai_threads")
      .insert({ user_id: userId, title: title.slice(0, 80), post_id: postId ?? null })
      .select("id").single();
    if (error) throw error;
    return data.id;
  } catch { return null; }
}

export async function loadMessages(threadId: string): Promise<AiMessage[]> {
  if (!supabaseEnabled || !threadId) return [];
  try {
    const { data } = await supabase!
      .from("ai_messages")
      .select("id, role, content, engine, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    return (data || []).map((r: any) => ({
      id: r.id, role: r.role, content: r.content, engine: r.engine || undefined, createdAt: r.created_at,
    }));
  } catch { return []; }
}

export async function saveMessage(userId: string, threadId: string, m: AiMessage): Promise<void> {
  if (!supabaseEnabled || !userId || !threadId) return;
  try {
    await supabase!.from("ai_messages").insert({
      thread_id: threadId, user_id: userId, role: m.role, content: m.content, engine: m.engine ?? null,
    });
  } catch { /* durability only — the screen already shows the message */ }
}

export async function renameThread(threadId: string, title: string): Promise<void> {
  if (!supabaseEnabled) return;
  try { await supabase!.from("ai_threads").update({ title: title.slice(0, 80) }).eq("id", threadId); } catch { /* non-fatal */ }
}

export async function deleteThread(threadId: string): Promise<void> {
  if (!supabaseEnabled) return;
  try { await supabase!.from("ai_threads").delete().eq("id", threadId); } catch { /* non-fatal */ }
}

/** First user line → a short thread title, so the drawer isn't a wall of "New chat". */
export function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= 40 ? t : t.slice(0, 40).replace(/\s\S*$/, "") + "…";
}
