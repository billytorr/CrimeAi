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
  plan?: "free" | "pro"; // Protector Plan — projection of tier_subscriptions (never set directly)
  showProBadge?: boolean; // Protector's choice: display the badge on their profile (default true)
  pushTypes?: Record<string, boolean>; // which push notification types they want
  bio?: string; // shown on the profile page
  phone?: string;
  address: string;
  location: ResolvedLocation;
  usedGeolocation: boolean;
  contacts: TrustedContact[];
  alerts: AlertPrefs;
}
export interface Account { id: string; name: string; email: string; profile: Profile | null; draftHandle?: string; draftPhoto?: string }

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
async function sbProfile(id: string): Promise<{ profile: Profile | null; name: string; email: string; handle?: string }> {
  const { data } = await supabase!.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!data) return { profile: null, name: "Neighbor", email: "" };
  return { profile: data.onboarded ? rowToProfile(data) : null, name: data.name || "Neighbor", email: data.email || "", handle: data.handle || undefined };
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
// Supabase OTPs are 6–10 digits (this project's are 8); accept any in range.
const OTP_RE = /^\d{6,10}$/;

// ── public API — email-first signup (Instagram / TikTok style) ───────
// The account is created by verifying the emailed code; the username +
// password are set AFTER verification, then legal, then the profile.
//
// Step 1: enter email → Supabase emails an OTP (no password yet).
export async function startEmailSignup(email: string): Promise<{ demoCode?: string; existingAccount?: boolean }> {
  const key = email.trim().toLowerCase();
  if (!key || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key)) throw new Error("Enter a valid email address.");

  if (supabaseEnabled) {
    // An existing user on the Create Account tab should be asked for the
    // password they already have, not OTP'd into a flow that ends with
    // "choose a username and password" — which reads like their account got
    // reset. account_exists() only counts FINISHED signups (password set):
    // someone who abandoned mid-signup has no password yet, and for them the
    // OTP flow is exactly right — it resumes where they left off.
    //
    // Fails OPEN: if the check itself errors, proceed with signup. Worst
    // case is today's behaviour; blocking signup on a helper would be worse.
    try {
      const { data: exists } = await supabase!.rpc("account_exists", { p_email: key });
      if (exists === true) return { existingAccount: true };
    } catch { /* fall through to the normal signup path */ }

    // shouldCreateUser: true → registers the email on first verify
    const { error } = await supabase!.auth.signInWithOtp({ email: key, options: { shouldCreateUser: true } });
    if (error) throw new Error(error.message);
    return {};
  }

  const accounts = readAccounts();
  if (accounts[key]?.profile) throw new Error("An account with that email already exists. Try logging in.");
  const code = genCode();
  localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({ email: key, code, exp: Date.now() + CODE_TTL_MS, verified: false }));
  return { demoCode: code };
}

// Step 2: verify the emailed code → this creates the account + session.
export async function verifyEmailSignup(email: string, code: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const token = code.trim();
  if (!OTP_RE.test(token)) throw new Error("Enter the code we emailed you.");

  if (supabaseEnabled) {
    const { error } = await supabase!.auth.verifyOtp({ email: key, token, type: "email" });
    if (error) throw new Error("That code didn't match. Check the email and try again.");
    return;
  }

  const pending = readPending(PENDING_SIGNUP_KEY);
  if (!pending || pending.email !== key) throw new Error("Start over — we couldn't find that signup.");
  if (Date.now() > pending.exp) throw new Error("That code expired. Resend a new one.");
  if (pending.code !== token) throw new Error("That code didn't match. Try again.");
  localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({ ...pending, verified: true }));
}

// Step 3: set the username + password (email already verified/authenticated).
export async function setSignupCredentials(email: string, username: string, password: string, confirm: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const handle = username.trim().toLowerCase();
  if (!handle) throw new Error("Choose a username.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (password !== confirm) throw new Error("Passwords don't match.");

  if (supabaseEnabled) {
    const { data: u } = await supabase!.auth.getUser();
    if (!u.user?.id) throw new Error("Verify your email first.");
    const { error } = await supabase!.auth.updateUser({ password, data: { handle } });
    if (error) throw new Error(error.message);
    return;
  }

  const pending = readPending(PENDING_SIGNUP_KEY);
  if (!pending || pending.email !== key || !pending.verified) throw new Error("Verify your email first.");
  const accounts = readAccounts();
  const salt = randomSalt();
  accounts[key] = { name: "", email: key, handle, salt, hash: await hashPassword(password, salt), profile: null, createdAt: new Date().toISOString() };
  writeAccounts(accounts);
  localStorage.setItem(SESSION_KEY, key);
  localStorage.removeItem(PENDING_SIGNUP_KEY);
}

// Resend the signup OTP.
export async function resendSignupCode(email: string): Promise<{ demoCode?: string }> {
  const key = email.trim().toLowerCase();
  if (supabaseEnabled) {
    const { error } = await supabase!.auth.signInWithOtp({ email: key, options: { shouldCreateUser: true } });
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

// Reset password — STEP 1: verify the emailed recovery code. On success
// Supabase holds a recovery session; the new password is set in step 2.
export async function verifyResetCode(email: string, code: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const token = code.trim();
  if (!OTP_RE.test(token)) throw new Error("Enter the code we emailed you.");

  if (supabaseEnabled) {
    const { error } = await supabase!.auth.verifyOtp({ email: key, token, type: "recovery" });
    if (error) throw new Error("That code didn't match. Check the email and try again.");
    return;
  }

  const pending = readPending(PENDING_RESET_KEY);
  if (!pending || pending.email !== key) throw new Error("Start over — request a new code.");
  if (Date.now() > pending.exp) throw new Error("That code expired. Request a new one.");
  if (pending.code !== token) throw new Error("That code didn't match. Try again.");
  // mark verified so step 2 can proceed without re-entering the code
  localStorage.setItem(PENDING_RESET_KEY, JSON.stringify({ ...pending, verified: true }));
}

// Reset password — STEP 2: set the new password (code already verified),
// then sign them in.
export async function setNewPassword(email: string, newPassword: string, confirmPassword: string): Promise<Account> {
  const key = email.trim().toLowerCase();
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
  if (newPassword !== confirmPassword) throw new Error("Passwords don't match.");

  if (supabaseEnabled) {
    const { error } = await supabase!.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    const { data } = await supabase!.auth.getUser();
    const id = data.user?.id || "";
    const { profile, name } = await sbProfile(id);
    return { id, name, email: key, profile };
  }

  const pending = readPending(PENDING_RESET_KEY);
  if (!pending || pending.email !== key || !pending.verified) throw new Error("Verify your code first.");
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
  // scope "local" signs out THIS device only. Supabase defaults to "global",
  // which revokes every session the user has anywhere — so signing out on a
  // phone was also signing them out on their laptop and tablet. Nobody expects
  // that from a Log out button.
  if (supabaseEnabled) { await supabase!.auth.signOut({ scope: "local" }); return; }
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
    const { profile, name, email, handle } = await sbProfile(data.user.id);
    const meta = data.user.user_metadata || {};
    // SAFEGUARD: once a profile exists, its name is AUTHORITATIVE — Google/
    // Apple SSO metadata can NEVER overwrite it (that's what changed a name
    // to the Gmail name before). Only a brand-new account (no profile yet)
    // prefills its name from the SSO identity, which the user edits in
    // onboarding. Same for the username/handle.
    const displayName = profile ? name : ((meta.name as string) || (meta.full_name as string) || name);
    const draftHandle = handle || (meta.handle as string | undefined);
    // Google/Apple hand us an avatar at sign-in and it was being dropped, so
    // an SSO user reached onboarding with a blank photo even though the
    // provider had supplied one. Prefill it — under the SAME rule as the name
    // above: brand-new accounts ONLY. Once a profile exists its photo is
    // authoritative and SSO metadata can never overwrite it.
    const draftPhoto = profile ? undefined : ((meta.avatar_url as string) || (meta.picture as string) || undefined);
    return { id: data.user.id, name: displayName, email: email || data.user.email || "", profile, draftHandle, draftPhoto };
  }
  if (typeof window === "undefined") return null;
  const key = localStorage.getItem(SESSION_KEY);
  if (!key) return null;
  const acc = readAccounts()[key];
  if (!acc) return null;
  return { id: key, name: acc.name, email: key, profile: acc.profile, draftHandle: acc.handle };
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
  if (opts?.name) accounts[key].name = opts.name;
  if (profile.handle) accounts[key].handle = profile.handle;
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
