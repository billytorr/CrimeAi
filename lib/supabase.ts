import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Post } from "./social";
import type { Profile } from "./auth";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// When both are set, the app uses the real backend (cross-device sync).
// Otherwise it transparently falls back to localStorage (zero-config demo).
export const supabaseEnabled = !!(url && anon);
export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

// ── row ⇄ object mappers ─────────────────────────────────────
export function rowToPost(r: any): Post {
  return {
    id: r.id,
    kind: r.kind,
    author: r.author,
    handle: r.handle,
    color: r.color || "#1b7f3a",
    verified: !!r.verified,
    neighborhood: r.neighborhood || "Miami",
    lat: r.lat ?? 25.7743,
    lon: r.lon ?? -80.1937,
    text: r.text || "",
    category: r.category || undefined,
    media: r.media_url ? { type: r.media_type || "image", url: r.media_url } : undefined,
    scene: r.scene || undefined,
    durationSec: r.duration_sec || undefined,
    thread: r.thread || undefined,
    tags: r.tags || undefined,
    source: r.source || undefined,
    createdAt: r.created_at,
    likes: r.likes ?? 0,
    comments: r.comments ?? 0,
    shares: r.shares ?? 0,
    reposts: r.reposts ?? 0,
    isLive: r.is_live ?? false,
    viewers: r.viewers ?? undefined,
    mine: false, // set by caller relative to current user
  };
}

export function postToRow(p: Post, userId: string) {
  return {
    user_id: userId,
    kind: p.kind,
    author: p.author,
    handle: p.handle,
    color: p.color,
    verified: p.verified,
    neighborhood: p.neighborhood,
    lat: p.lat,
    lon: p.lon,
    text: p.text,
    category: p.category ?? null,
    media_url: p.media?.url ?? null,
    media_type: p.media?.type ?? null,
    scene: p.scene ?? null,
    duration_sec: p.durationSec ?? null,
    thread: p.thread ?? null,
    tags: p.tags ?? null,
    source: p.source ?? null,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    is_live: p.isLive ?? false,
    viewers: p.viewers ?? null,
  };
}

export function rowToProfile(r: any): Profile {
  return {
    photo: r.photo_url || "",
    handle: r.handle || undefined,
    liveEnabled: !!r.live_enabled,
    isPrivate: !!r.is_private,
    sosEnabled: r.sos_enabled !== false, // default on
    plan: r.plan === "pro" ? "pro" : "free",
    showProBadge: r.show_pro_badge !== false,
    pushTypes: r.push_types || undefined,
    bio: r.bio || "",
    phone: r.phone || "",
    address: r.address || "",
    location: {
      query: r.address || r.neighborhood || "",
      lat: r.lat ?? 25.7607,
      lon: r.lon ?? -80.1918,
      neighborhood: r.neighborhood || "Brickell",
      city: "Miami",
      state: "FL",
      source: "gazetteer",
    },
    usedGeolocation: !!r.used_geolocation,
    contacts: r.contacts || [],
    alerts: {
      radiusMiles: r.radius_miles ?? 1,
      categories: r.alert_categories || [],
      channels: r.alert_channels || { push: true, sms: false, email: true },
      severityMin: r.severity_min ?? 2,
    },
  };
}

export function profileToRow(p: Profile, id: string, name: string, email: string) {
  return {
    id,
    name,
    email,
    photo_url: p.photo || "",
    handle: p.handle || null,
    is_private: !!p.isPrivate,
    sos_enabled: p.sosEnabled !== false,
    show_pro_badge: p.showProBadge !== false,
    ...(p.pushTypes ? { push_types: p.pushTypes } : {}),
    bio: p.bio || "",
    phone: p.phone || "",
    address: p.address,
    neighborhood: p.location.neighborhood,
    lat: p.location.lat,
    lon: p.location.lon,
    used_geolocation: p.usedGeolocation,
    radius_miles: p.alerts.radiusMiles,
    alert_categories: p.alerts.categories,
    alert_channels: p.alerts.channels,
    severity_min: p.alerts.severityMin,
    contacts: p.contacts,
    onboarded: true,
  };
}

// Upload a media File to the public `media` bucket; returns its public URL.
export async function uploadMedia(file: File, userId: string): Promise<{ url: string; type: "image" | "video" }> {
  if (!supabase) throw new Error("Supabase not configured");
  const type: "image" | "video" = file.type.startsWith("video") ? "video" : "image";
  const ext = file.name.split(".").pop() || (type === "video" ? "mp4" : "jpg");
  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return { url: data.publicUrl, type };
}
