// ── Auth + profile ───────────────────────────────────────────
// Uses Supabase Auth + Postgres when configured (real accounts that
// sync across devices), and transparently falls back to a local
// SHA-256 + localStorage implementation so the app runs with zero
// config for demos. All functions are async; callers await them.
import type { ResolvedLocation } from "./types";
import { supabase, supabaseEnabled, rowToProfile, profileToRow } from "./supabase";

export interface TrustedContact { name: string; phone: string }
export interface AlertPrefs {
  radiusMiles: number;
  categories: string[];
  channels: { push: boolean; sms: boolean; email: boolean };
  severityMin: number;
}
export interface Profile {
  photo: string;
  handle?: string; // unique @username, chosen at signup (Instagram-style)
  liveEnabled?: boolean; // Live Media Brand Ambassador — granted by admins only
  isPrivate?: boolean; // private account: posts visible to approved followers only
  sosEnabled?: boolean; // floating SOS button on/off (Settings → Emergency SOS); default on
  plan?: "free" | "pro"; // Protector Plan — set by the payment webhook only
  bio?: string; // shown on the profile page
  phone?: string;
  address: string;
  location: ResolvedLocation;
  usedGeolocation: boolean;
  contacts: TrustedContact[];
  alerts: AlertPrefs;
}
export interface Account { id: string; name: string; email: string; profile: Profile | null }

// The user's public @handle everywhere in the app — their chosen username,
// falling back to the email prefix for accounts created before handles.
export const accountHandle = (a: { email: string; profile: Profile | null }): string =>
  a.profile?.handle || a.email.split("@")[0] || "you";

export const defaultAlerts = (): AlertPrefs => ({
  radiusMiles: 1,
  categories: [],
  channels: { push: true, sms: false, email: true },
  severityMin: 2,
});

// ── Supabase path ────────────────────────────────────────────
async function sbProfile(id: string): Promise<{ profile: Profile | null; name: string; email: string }> {
  const { data } = await supabase!.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!data) return { profile: null, name: "Neighbor", email: "" };
  return { profile: data.onboarded ? rowToProfile(data) : null, name: data.name || "Neighbor", email: data.email || "" };
}

// ── localStorage path ────────────────────────────────────────
const ACCOUNTS_KEY = "pscc_accounts";
const SESSION_KEY = "pscc_session";
function readAccounts(): Record<string, any> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}"); } catch { return {}; }
}
function writeAccounts(a: Record<string, any>) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); }
function randomSalt(): string {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`));
  return Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ── verification codes (signup + password reset) ────────────
// With Supabase configured, real 6-digit codes are emailed from the
// publicsafetycrimecenter.com domain (Auth → SMTP + template with
// {{ .Token }}). In local demo mode we generate the code on-device and
// hand it back as `demoCode` so the UI can display it — the full flow
// stays demo-able with zero infrastructure.
const PENDING_SIGNUP_KEY = "pscc_pending_signup";
const PENDING_RESET_KEY = "pscc_pending_reset";
const CODE_TTL_MS = 10 * 60 * 1000;

function genCode(): string {
  // 8 digits to match Supabase's OTP length (demo/offline mode)
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(10000000 + (b[0] % 90000000));
}
function readPending(key: string): any | null {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

// ── public API ───────────────────────────────────────────────
// Step 1 of signup: validate, stash the pending account, send the code.
// `alreadyVerified` is returned when the backend has email confirmation
// disabled (it hands back a live session immediately) — the UI then skips
// the code screen instead of stranding the user on it.
export async function startSignup(name: string, email: string, password: string): Promise<{ demoCode?: string; alreadyVerified?: boolean }> {
  const key = email.trim().toLowerCase();
  if (!key || !password) throw new Error("Email and password are required.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  if (supabaseEnabled) {
    const { data, error } = await supabase!.auth.signUp({ email: key, password, options: { data: { name: name.trim() || "Neighbor" } } });
    if (error) throw new Error(error.message);
    if (data.session) return { alreadyVerified: true };
    return {}; // confirmation is on — Supabase emails the 6-digit code
  }

  const accounts = readAccounts();
  if (accounts[key]) throw new Error("An account with that email already exists. Try logging in.");
  const salt = randomSalt();
  const code = genCode();
  localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({
    name: name.trim() || "Neighbor", email: key, salt, hash: await hashPassword(password, salt), code, exp: Date.now() + CODE_TTL_MS,
  }));
  return { demoCode: code };
}

// Step 2 of signup: verify the emailed code, then the account goes live.
export async function verifySignup(email: string, code: string): Promise<Account> {
  const key = email.trim().toLowerCase();
  const token = code.trim();
  if (token.length !== 6) throw new Error("Enter the 6-digit code.");

  if (supabaseEnabled) {
    const { data, error } = await supabase!.auth.verifyOtp({ email: key, token, type: "signup" });
    if (error) throw new Error("That code didn't match. Check the email and try again.");
    const id = data.user?.id || "";
    return { id, name: data.user?.user_metadata?.name || "Neighbor", email: key, profile: null };
  }

  const pending = readPending(PENDING_SIGNUP_KEY);
  if (!pending || pending.email !== key) throw new Error("Start over — we couldn't find that signup.");
  if (Date.now() > pending.exp) throw new Error("That code expired. Resend a new one.");
  if (pending.code !== token) throw new Error("That code didn't match. Try again.");
  const accounts = readAccounts();
  accounts[key] = { name: pending.name, email: key, salt: pending.salt, hash: pending.hash, profile: null, createdAt: new Date().toISOString() };
  writeAccounts(accounts);
  localStorage.removeItem(PENDING_SIGNUP_KEY);
  localStorage.setItem(SESSION_KEY, key);
  return { id: key, name: accounts[key].name, email: key, profile: null };
}

export async function resendSignupCode(email: string): Promise<{ demoCode?: string }> {
  const key = email.trim().toLowerCase();
  if (supabaseEnabled) {
    const { error } = await supabase!.auth.resend({ type: "signup", email: key });
    if (error) throw new Error(error.message);
    return {};
  }
  const pending = readPending(PENDING_SIGNUP_KEY);
  if (!pending || pending.email !== key) throw new Error("Start over — we couldn't find that signup.");
  pending.code = genCode();
  pending.exp = Date.now() + CODE_TTL_MS;
  localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(pending));
  return { demoCode: pending.code };
}

// ── SSO (Google / Apple) ─────────────────────────────────────
// Production: Supabase OAuth — redirects to the provider and back; the
// session is picked up by getCurrentAccount() on return. Providers are
// configured in Supabase → Auth → Providers (Google Cloud OAuth client /
// Apple Services ID). Demo mode: signs into a local demo identity so the
// button flow is demonstrable with zero configuration.
export async function ssoLogin(provider: "google" | "apple"): Promise<Account | null> {
  if (supabaseEnabled) {
    const { error } = await supabase!.auth.signInWithOAuth({
      provider,
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (error) throw new Error(error.message);
    return null; // browser is redirecting to the provider
  }

  const key = provider === "google" ? "neighbor@gmail.com" : "neighbor@icloud.com";
  const accounts = readAccounts();
  if (!accounts[key]) {
    const salt = randomSalt();
    accounts[key] = {
      name: provider === "google" ? "Google Neighbor" : "Apple Neighbor",
      email: key, salt, hash: await hashPassword(randomSalt(), salt), sso: provider,
      profile: null, createdAt: new Date().toISOString(),
    };
    writeAccounts(accounts);
  }
  localStorage.setItem(SESSION_KEY, key);
  const acc = accounts[key];
  return { id: key, name: acc.name, email: key, profile: acc.profile };
}

// Forgot password: email a 6-digit recovery code.
export async function requestPasswordReset(email: string): Promise<{ demoCode?: string }> {
  const key = email.trim().toLowerCase();
  if (!key) throw new Error("Enter your email.");
  if (supabaseEnabled) {
    const { error } = await supabase!.auth.resetPasswordForEmail(key);
    if (error) throw new Error(error.message);
    return {};
  }
  const accounts = readAccounts();
  if (!accounts[key]) throw new Error("No account found for that email.");
  const code = genCode();
  localStorage.setItem(PENDING_RESET_KEY, JSON.stringify({ email: key, code, exp: Date.now() + CODE_TTL_MS }));
  return { demoCode: code };
}

// Reset password: verify the code, set the new password, sign them in.
export async function completePasswordReset(email: string, code: string, newPassword: string): Promise<Account> {
  const key = email.trim().toLowerCase();
  const token = code.trim();
  if (token.length !== 6) throw new Error("Enter the 6-digit code.");
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");

  if (supabaseEnabled) {
    const { data, error } = await supabase!.auth.verifyOtp({ email: key, token, type: "recovery" });
    if (error) throw new Error("That code didn't match. Check the email and try again.");
    const { error: e2 } = await supabase!.auth.updateUser({ password: newPassword });
    if (e2) throw new Error(e2.message);
    const id = data.user?.id || "";
    const { profile, name } = await sbProfile(id);
    return { id, name, email: key, profile };
  }

  const pending = readPending(PENDING_RESET_KEY);
  if (!pending || pending.email !== key) throw new Error("Start over — request a new code.");
  if (Date.now() > pending.exp) throw new Error("That code expired. Request a new one.");
  if (pending.code !== token) throw new Error("That code didn't match. Try again.");
  const accounts = readAccounts();
  const acc = accounts[key];
  if (!acc) throw new Error("Account missing.");
  acc.salt = randomSalt();
  acc.hash = await hashPassword(newPassword, acc.salt);
  writeAccounts(accounts);
  localStorage.removeItem(PENDING_RESET_KEY);
  localStorage.setItem(SESSION_KEY, key);
  return { id: key, name: acc.name, email: key, profile: acc.profile };
}

export async function login(email: string, password: string): Promise<Account> {
  const key = email.trim().toLowerCase();
  if (supabaseEnabled) {
    const { data, error } = await supabase!.auth.signInWithPassword({ email: key, password });
    if (error) throw new Error(error.message);
    const id = data.user!.id;
    if (await isBanned(id)) {
      await supabase!.auth.signOut();
      throw new Error("This account has been suspended for violating community guidelines. Contact support@publicsafetycrimecenter.com to appeal.");
    }
    const { profile, name } = await sbProfile(id);
    return { id, name, email: key, profile };
  }
  const accounts = readAccounts();
  const acc = accounts[key];
  if (!acc) throw new Error("No account found for that email.");
  if ((await hashPassword(password, acc.salt)) !== acc.hash) throw new Error("Incorrect password.");
  localStorage.setItem(SESSION_KEY, key);
  return { id: key, name: acc.name, email: key, profile: acc.profile };
}

export async function logout(): Promise<void> {
  if (supabaseEnabled) { await supabase!.auth.signOut(); return; }
  localStorage.removeItem(SESSION_KEY);
}

// Ban check — enforced at session restore AND login so a banned user is
// locked out immediately, even with a live session on their device.
async function isBanned(id: string): Promise<boolean> {
  const { data } = await supabase!.from("profiles").select("banned").eq("id", id).maybeSingle();
  return !!data?.banned;
}

export async function getCurrentAccount(): Promise<Account | null> {
  if (supabaseEnabled) {
    const { data } = await supabase!.auth.getUser();
    if (!data.user) return null;
    if (await isBanned(data.user.id)) { await supabase!.auth.signOut(); return null; }
    const { profile, name, email } = await sbProfile(data.user.id);
    return { id: data.user.id, name, email: email || data.user.email || "", profile };
  }
  if (typeof window === "undefined") return null;
  const key = localStorage.getItem(SESSION_KEY);
  if (!key) return null;
  const acc = readAccounts()[key];
  if (!acc) return null;
  return { id: key, name: acc.name, email: key, profile: acc.profile };
}

export async function saveProfile(profile: Profile, opts?: { id: string; name: string; email: string }): Promise<void> {
  if (supabaseEnabled) {
    const { data } = await supabase!.auth.getUser();
    const id = opts?.id || data.user?.id;
    if (!id) throw new Error("Not signed in.");
    const name = opts?.name || data.user?.user_metadata?.name || "Neighbor";
    const email = opts?.email || data.user?.email || "";
    const { error } = await supabase!.from("profiles").upsert(profileToRow(profile, id, name, email));
    if (error) throw new Error(error.message);
    return;
  }
  const key = localStorage.getItem(SESSION_KEY);
  if (!key) throw new Error("Not signed in.");
  const accounts = readAccounts();
  if (!accounts[key]) throw new Error("Account missing.");
  accounts[key].profile = profile;
  writeAccounts(accounts);
}

export async function updateName(name: string): Promise<void> {
  const n = name.trim();
  if (!n) return;
  if (supabaseEnabled) {
    const { data } = await supabase!.auth.getUser();
    if (!data.user) return;
    await supabase!.auth.updateUser({ data: { name: n } });
    // server-side cascade: profile + every past post and comment
    await supabase!.rpc("update_display_name", { new_name: n });
    return;
  }
  const key = localStorage.getItem(SESSION_KEY);
  if (!key) return;
  const accounts = readAccounts();
  if (accounts[key]) { accounts[key].name = n; writeAccounts(accounts); }
}
