"use client";

// @handle (username) system — Instagram's rules, adapted to CrimeAI:
//   • 3–30 chars: lowercase letters, numbers, periods, underscores
//   • no leading/trailing period, no consecutive periods
//   • unique case-insensitively (stored lowercase)
//   • reserved names blocked
//   • live availability checks + suggestions when taken
//   • renames cascade so old posts/follows move to the new handle
import { supabase, supabaseEnabled } from "./supabase";
import { LOCAL_USERS } from "./social";

// Names the platform keeps for itself (impersonation/abuse prevention).
const RESERVED = new Set([
  "crimeai", "pscc", "admin", "administrator", "support", "help", "official",
  "police", "mdpd", "miamipd", "fbi", "911", "emergency", "sos", "safety",
  "mod", "moderator", "staff", "team", "security", "news", "alerts", "system",
  "blackseed", "torr", "torrai", "you", "me", "user", "null", "undefined",
]);

export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

// Returns an error message, or null when the format is valid.
export function validateHandle(raw: string): string | null {
  const h = normalizeHandle(raw);
  if (h.length < 3) return "Usernames need at least 3 characters.";
  if (h.length > 30) return "Usernames can't be longer than 30 characters.";
  if (!/^[a-z0-9._]+$/.test(h)) return "Only lowercase letters, numbers, periods and underscores.";
  if (h.startsWith(".") || h.endsWith(".")) return "Usernames can't start or end with a period.";
  if (h.includes("..")) return "Usernames can't have two periods in a row.";
  if (RESERVED.has(h)) return "That username is reserved.";
  return null;
}

export type HandleStatus = "available" | "taken" | "invalid";

export async function checkHandle(raw: string, ownId?: string): Promise<HandleStatus> {
  const h = normalizeHandle(raw);
  if (validateHandle(h)) return "invalid";

  if (supabaseEnabled) {
    const { data } = await supabase!.from("profiles").select("id").eq("handle", h).limit(1);
    if (data && data.length && data[0].id !== ownId) return "taken";
    // handles derived from emails of accounts that haven't picked one yet
    const { data: em } = await supabase!.from("profiles").select("id").is("handle", null).like("email", `${h}@%`).limit(1);
    if (em && em.length && em[0].id !== ownId) return "taken";
    return "available";
  }

  // demo mode: persona handles + local accounts
  if (LOCAL_USERS.some((u) => u.handle === h)) return "taken";
  try {
    const session = localStorage.getItem("pscc_session");
    const accounts = JSON.parse(localStorage.getItem("pscc_accounts") || "{}");
    for (const key of Object.keys(accounts)) {
      if (key === session) continue; // your own current handle isn't "taken"
      if ((accounts[key].profile?.handle || key.split("@")[0]) === h) return "taken";
    }
  } catch {}
  return "available";
}

// Instagram-style suggestions: derived from the person's name/email,
// filtered to ones that are actually free right now.
export async function suggestHandles(name: string, email: string, ownId?: string): Promise<string[]> {
  const first = (name.trim().split(/\s+/)[0] || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const last = (name.trim().split(/\s+/)[1] || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const mail = normalizeHandle(email.split("@")[0] || "").replace(/[^a-z0-9._]/g, "");
  const rnd = () => String(Math.floor(Math.random() * 900) + 100);

  const raw = [
    first && last ? `${first}.${last}` : "",
    first && last ? `${first}_${last}` : "",
    first ? `${first}305` : "",                    // Miami's area code
    first && last ? `${first}${last}${rnd()}` : "",
    mail,
    mail ? `${mail}_mia` : "",
    first ? `${first}.miami` : "",
    first ? `${first}${rnd()}` : "",
  ].filter(Boolean).filter((h) => !validateHandle(h));

  const out: string[] = [];
  for (const h of Array.from(new Set(raw))) {
    if (out.length >= 3) break;
    if ((await checkHandle(h, ownId)) === "available") out.push(h);
  }
  return out;
}

// Claim/change a handle. On rename, existing posts and followers move
// with you (like Instagram — your content keeps your new username).
export async function saveHandle(userId: string, newHandle: string, oldHandle?: string): Promise<void> {
  const h = normalizeHandle(newHandle);
  const err = validateHandle(h);
  if (err) throw new Error(err);
  if ((await checkHandle(h, userId)) === "taken") throw new Error("That username was just taken. Try another.");

  if (supabaseEnabled) {
    // server-side, atomic: profile + posts + followers move together
    const { error } = await supabase!.rpc("rename_handle", { new_handle: h });
    if (error) {
      // unique-constraint race: someone claimed it between check and save
      throw new Error(/duplicate|unique/i.test(error.message) ? "That username was just taken. Try another." : error.message);
    }
    return;
  }

  try {
    const key = localStorage.getItem("pscc_session");
    if (!key) return;
    const accounts = JSON.parse(localStorage.getItem("pscc_accounts") || "{}");
    if (accounts[key]) {
      accounts[key].profile = { ...(accounts[key].profile || {}), handle: h };
      localStorage.setItem("pscc_accounts", JSON.stringify(accounts));
    }
  } catch {}
}
