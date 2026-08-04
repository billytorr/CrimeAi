// Server-side Supabase client for payment routes. Uses the SERVICE ROLE
// key (env only — grants full DB access for webhook writes). Falls back
// to the public key for read-only status checks when unset.
import { createClient } from "@supabase/supabase-js";

// Next.js App Router patches global fetch to CACHE GET requests by default.
// supabase-js issues its reads through fetch, so an identical query (e.g. the
// tier-config read) gets frozen in Next's Data Cache and never reflects DB
// changes — config/entitlement updates would silently not propagate. Force
// every DB call to bypass that cache so reads are always fresh.
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

export function serverDb(privileged = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = privileged
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Database credentials missing");
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: noStoreFetch },
  });
}
