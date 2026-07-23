"use client";

// Legal documents (Terms of Service + Privacy Policy).
// Latest published versions come from the database (editable in the
// Command Center); acceptance is recorded per user + version + timestamp,
// which is the evidence that makes the click-through agreement stick.
import { supabase, supabaseEnabled } from "./supabase";

export interface LegalDoc { kind: "terms" | "privacy"; version: number; title: string; body: string }

const PENDING_KEY = "pscc_legal_pending"; // accepted pre-auth, flushed once signed in

const FALLBACK: LegalDoc[] = [
  {
    kind: "terms", version: 1, title: "CrimeAI Terms of Service",
    body: "CrimeAI is an informational community safety network — NOT an emergency service and not a substitute for 911. Reports are unverified community information; post only what you observed, never identify private individuals, never confront anyone. AI answers may be wrong and are not professional advice. Content you post is licensed to CrimeAI to operate the service. Disputes are resolved by individual arbitration in Florida (class action waiver). Full terms are served from the production database.",
  },
  {
    kind: "privacy", version: 1, title: "CrimeAI Privacy Policy",
    body: "We collect account, profile, location (with permission), content, usage analytics and device data to run feeds, maps, alerts and AI features. Public content is visible to others; we do not sell personal data. We may disclose data under valid legal process or to prevent imminent harm. You can access or delete your data: privacy@publicsafetycrimecenter.com. Full policy is served from the production database.",
  },
];

// Latest published version of each document.
export async function getLegalDocs(): Promise<LegalDoc[]> {
  if (!supabaseEnabled) return FALLBACK;
  const { data } = await supabase!
    .from("legal_documents")
    .select("kind, version, title, body")
    .eq("published", true)
    .order("version", { ascending: false });
  if (!data?.length) return FALLBACK;
  const latest = new Map<string, LegalDoc>();
  for (const d of data) if (!latest.has(d.kind)) latest.set(d.kind, d as LegalDoc);
  return ["terms", "privacy"].map((k) => latest.get(k)).filter(Boolean) as LegalDoc[];
}

// Called at the moment of agreement (pre-auth): remember what was agreed.
export function stashAcceptance(docs: LegalDoc[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(docs.map((d) => ({ kind: d.kind, version: d.version }))));
  } catch {}
}

// Called once a session exists (after verify / SSO): write the records.
export async function flushAcceptance(userId: string) {
  if (!supabaseEnabled) { localStorage.removeItem(PENDING_KEY); return; }
  try {
    const pending: { kind: string; version: number }[] = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    if (!pending.length) return;
    await supabase!.from("legal_acceptances").upsert(
      pending.map((p) => ({ user_id: userId, doc_kind: p.kind, version: p.version })),
      { onConflict: "user_id,doc_kind,version" }
    );
    localStorage.removeItem(PENDING_KEY);
  } catch { /* retried on next launch via pending key */ }
}
