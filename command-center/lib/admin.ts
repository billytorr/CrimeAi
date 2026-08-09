"use client";

// Command Center data layer. All queries run with the signed-in admin's
// session — the database's row-level-security policies (supabase/admin.sql
// in the app repo) are what actually grant admin powers, so this portal
// holds no privileged keys.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export interface Admin { id: string; email: string; role: Role; name: string }

// Role model mirrors Facebook's Page roles (Admin/Editor/Moderator/Analyst),
// adapted to PSCC. Access is enforced twice: sections hidden here, and the
// database RLS policies reject anything a role isn't allowed to touch.
export type Role = "owner" | "admin" | "moderator" | "analyst" | "finance";
export type SectionId = "overview" | "users" | "content" | "analytics" | "feedback" | "issues" | "updates" | "ambassadors" | "legal" | "finance" | "sources" | "scores" | "verifications" | "plans" | "assistant" | "security" | "settings";

export const ROLE_INFO: Record<Role, { label: string; blurb: string }> = {
  owner: { label: "Owner", blurb: "Full control. Manages every team member, including admins. Cannot be removed from the portal." },
  admin: { label: "Admin", blurb: "Full control of the app: users, content, analytics, updates, security. Can invite moderators and analysts." },
  moderator: { label: "Moderator", blurb: "Front-line safety: manage users (ban/unban), moderate content, handle feedback and issues." },
  analyst: { label: "Analyst", blurb: "Read-only insights: overview dashboard and analytics. No moderation or publishing powers." },
  finance: { label: "Finance", blurb: "Revenue and billing: paid users, payments, plan pricing and benefits, merchant configuration." },
};

const SECTION_ACCESS: Record<SectionId, Role[]> = {
  overview: ["owner", "admin", "moderator", "analyst", "finance"],
  users: ["owner", "admin", "moderator"],
  content: ["owner", "admin", "moderator"],
  analytics: ["owner", "admin", "analyst"],
  feedback: ["owner", "admin", "moderator"],
  issues: ["owner", "admin", "moderator"],
  updates: ["owner", "admin"],
  ambassadors: ["owner", "admin", "moderator"],
  legal: ["owner", "admin"],
  finance: ["owner", "admin", "finance"],
  sources: ["owner", "admin", "moderator"],
  scores: ["owner", "admin", "analyst"],
  // Approving an ID grants the verified check and unlocks crime reporting —
  // the highest-trust action in the portal. Not delegated to analysts.
  verifications: ["owner", "admin"],
  // Editing a price changes what NEW subscribers are charged.
  plans: ["owner", "admin"],
  assistant: ["owner", "admin"],
  security: ["owner", "admin"],
  settings: ["owner", "admin"],
};
export const canAccess = (role: Role, section: SectionId) => SECTION_ACCESS[section].includes(role);

export async function adminLogin(email: string, password: string): Promise<Admin> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(error.message);
  const admin = await currentAdmin();
  if (!admin) {
    await supabase.auth.signOut();
    throw new Error("This account does not have Command Center access.");
  }
  return admin;
}

export async function currentAdmin(): Promise<Admin | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await supabase.from("admins").select("*").eq("id", data.user.id).maybeSingle();
  if (!row) return null;
  return { id: data.user.id, email: row.email, role: row.role, name: data.user.user_metadata?.name || row.email };
}

export async function adminLogout() { await supabase.auth.signOut(); }

// Every consequential action lands in the audit log.
export async function audit(admin: Admin, action: string, target: string, meta: Record<string, unknown> = {}) {
  await supabase.from("audit_log").insert({ admin_id: admin.id, admin_email: admin.email, action, target, meta });
}

// ── team management ─────────────────────────────────────────────────
export interface Member { id: string; email: string; name: string; role: Role; invited_by: string; created_at: string }

export async function listMembers(): Promise<Member[]> {
  const { data } = await supabase.from("admins").select("*").order("created_at");
  return (data || []) as Member[];
}

// Invite flow (Facebook-style, adapted until branded email is live):
// if the email already has a CrimeAI account we grant portal access to it;
// otherwise we create the account and hand back a ONE-TIME temp password
// for the inviter to pass along. The invitee should change it after login.
export async function inviteMember(
  inviter: Admin, email: string, name: string, role: Role
): Promise<{ tempPassword?: string }> {
  const key = email.trim().toLowerCase();
  if (!key || !name.trim()) throw new Error("Name and email are required.");
  if (role === "owner") throw new Error("Ownership can't be granted from the portal.");

  // already on the team?
  const { data: existing } = await supabase.from("admins").select("id").eq("email", key).maybeSingle();
  if (existing) throw new Error("That person already has portal access.");

  // does the email already have an account? (profiles mirrors auth.users)
  const { data: prof } = await supabase.from("profiles").select("id").eq("email", key).maybeSingle();

  let userId = prof?.id as string | undefined;
  let tempPassword: string | undefined;

  if (!userId) {
    // create the account on an isolated client so the inviter's admin
    // session is never touched by the new signup
    tempPassword = genTempPassword();
    const throwaway = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data, error } = await throwaway.auth.signUp({
      email: key, password: tempPassword, options: { data: { name: name.trim() } },
    });
    if (error) throw new Error(error.message);
    userId = data.user?.id;
    if (!userId) throw new Error("Account creation didn't return a user. Try again.");
  }

  const { error: e2 } = await supabase.from("admins").insert({
    id: userId, email: key, name: name.trim(), role, invited_by: inviter.email,
  });
  if (e2) throw new Error(e2.message.includes("policy") ? "Your role can't grant that access level." : e2.message);

  // Admin typed the address, so the account counts as verified — otherwise
  // "confirm email" (when enabled) would lock the invitee out of the portal.
  await supabase.rpc("admin_confirm_invited", { target_email: key });

  await audit(inviter, "invite_member", key, { role, name: name.trim() });
  return { tempPassword };
}

export async function updateMemberRole(actor: Admin, member: Member, role: Role): Promise<void> {
  if (member.role === "owner" || role === "owner") throw new Error("Ownership can't be changed from the portal.");
  const { error } = await supabase.from("admins").update({ role }).eq("id", member.id);
  if (error) throw new Error(error.message.includes("policy") ? "Only the owner can manage admins." : error.message);
  await audit(actor, "change_member_role", member.email, { from: member.role, to: role });
}

export async function removeMember(actor: Admin, member: Member): Promise<void> {
  if (member.role === "owner") throw new Error("The owner can't be removed.");
  if (member.id === actor.id) throw new Error("You can't remove yourself. Ask another admin.");
  const { error } = await supabase.from("admins").delete().eq("id", member.id);
  if (error) throw new Error(error.message.includes("policy") ? "Only the owner can remove admins." : error.message);
  await audit(actor, "remove_member", member.email, { role: member.role });
}

function genTempPassword(): string {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  const s = btoa(String.fromCharCode.apply(null, Array.from(b))).replace(/[+/=]/g, "").slice(0, 10);
  return `PSCC-${s}!`;
}

export async function countOf(table: string, filter?: (q: any) => any): Promise<number> {
  let q: any = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count || 0;
}

// Bucket timestamps into daily counts for the last N days (small-scale
// analytics computed client-side; move server-side post-migration).
export function bucketByDay(rows: { created_at: string }[], days: number): { day: string; n: number }[] {
  const out: { day: string; n: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key.slice(5), n: rows.filter((r) => r.created_at?.slice(0, 10) === key).length });
  }
  return out;
}

export function timeAgo(ts: string): string {
  const s = Math.max(1, Math.floor((Date.now() - +new Date(ts)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
