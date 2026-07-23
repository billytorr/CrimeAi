"use client";

// Live Media Brand Ambassador program — LIVE streaming is invite-only.
// Users apply with qualifying info; the Command Center reviews and flips
// profiles.live_enabled on approval.
import { supabase, supabaseEnabled } from "./supabase";

export interface LiveApplication {
  reason: string; experience: string; socials: string; phone: string;
  status: "pending" | "approved" | "declined";
}

const LOCAL_KEY = "pscc_live_application";

export async function applyForLive(
  user: { id: string; name: string; email: string; handle: string },
  form: { reason: string; experience: string; socials: string; phone: string }
): Promise<void> {
  if (supabaseEnabled) {
    const { error } = await supabase!.from("live_applications").upsert({
      user_id: user.id, name: user.name, email: user.email, handle: user.handle,
      reason: form.reason.trim(), experience: form.experience.trim(),
      socials: form.socials.trim(), phone: form.phone.trim(), status: "pending",
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return;
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...form, status: "pending" }));
}

export async function getMyLiveApplication(userId: string): Promise<LiveApplication | null> {
  if (supabaseEnabled) {
    const { data } = await supabase!
      .from("live_applications")
      .select("reason, experience, socials, phone, status")
      .eq("user_id", userId).maybeSingle();
    return (data as LiveApplication) || null;
  }
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"); } catch { return null; }
}
