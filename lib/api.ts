// API base for the CrimeAI backend (ask / lookup / incidents routes).
// • Web + local dev: same origin ("" → relative /api/...)
// • Native iOS/Android builds: the app bundle has no server, so calls go
//   to the deployed backend — set NEXT_PUBLIC_API_BASE at build time,
//   e.g. https://api.publicsafetycrimecenter.com
const BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export const apiUrl = (path: string) => `${BASE}${path}`;

// Authorization header for API calls. The server uses the session to apply
// the caller's tier (AI allowance, map history, search). Calls without it
// are treated as anonymous = free-tier limits — nothing breaks, but signed-in
// users only get their Protector allowances when this header is attached.
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { supabase, supabaseEnabled } = await import("./supabase");
    if (!supabaseEnabled || !supabase) return {};
    const { data } = await supabase.auth.getSession();
    const jwt = data.session?.access_token;
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
  } catch {
    return {};
  }
}
