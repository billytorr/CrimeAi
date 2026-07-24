// Server-side Supabase client for payment routes. Uses the SERVICE ROLE
// key (env only — grants full DB access for webhook writes). Falls back
// to the public key for read-only status checks when unset.
import { createClient } from "@supabase/supabase-js";

export function serverDb(privileged = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = privileged
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Database credentials missing");
  return createClient(url, key, { auth: { persistSession: false } });
}
