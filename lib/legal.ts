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
  // ⚠️ v2 — rewritten 2026-08-06 for identity verification, biometric
  // handling, AI training and the law-enforcement policy. The version bump is
  // deliberate and required: acceptance is recorded per user PER VERSION, so
  // raising it re-prompts every existing user. A material change to what we
  // collect cannot ride on a previous version's consent.
  //
  // ⚠️ This fallback must stay in step with the published copy in the
  // legal_documents table (Command Center) — this text is what users see if
  // the database is unreachable, so a stale fallback is a false statement of
  // our practices. Source of truth for the practices themselves is
  // DATA-GOVERNANCE.md.
  {
    kind: "privacy", version: 2, title: "CrimeAI Privacy Policy",
    body:
      "WHAT WE COLLECT. Account and profile details; your address and location (with permission); the posts, reports, comments and messages you create; how you use the app — what you view, search, tap and respond to; and device data. " +
      "IDENTITY VERIFICATION. To post or report, we verify you are a real person. With your separate written consent, we and our verification partner collect a selfie, a photo of your government ID, and a face template generated from them, and check that they match. This is a one-to-one check against your own ID — we never search your face against other people, and we never identify a stranger from a photo. " +
      "We delete the selfie, the ID image and the face template within 24 hours of verification, and our partner deletes their copies on the same schedule. We keep only the outcome: that you were verified, when, by what method, your legal name, whether you are over 18, and the last four digits and issuing state of your ID. You may decline verification; you will still be able to read CrimeAI. " +
      "HOW LONG WE KEEP THINGS. Biometric images and templates: 24 hours. Verification outcome and consent records: 7 years after your account closes. Account and profile: while your account is open, plus 90 days. Posts and reports: kept as part of the community record, but unlinked from you if you delete your account. Usage and engagement data: 7 years, made pseudonymous after 24 months. Precise location history: 13 months, then reduced to ZIP-level. Payment records: 7 years. " +
      "AI TRAINING. Your posts, reports, engagement, searches and app usage are used to train CrimeAI and Torr AI models operated by BlackSeed Labs. Training data is pseudonymous. We never train models on biometric data, ID documents, direct messages or payment details. You can opt out in Settings. " +
      "SELLING AND SHARING. We do not sell your data to advertisers or data brokers. We share it with service providers who operate the app under contract, and with BlackSeed Labs and Torr AI as described above. " +
      "LAW ENFORCEMENT. We disclose data to law enforcement only in response to a valid subpoena, court order or warrant, or when we believe in good faith that someone faces an imminent risk of death or serious injury. We notify you before disclosing unless a court forbids it or it is an emergency. No agency has standing, bulk or self-serve access to CrimeAI data. We log every request and publish an annual transparency report. " +
      "YOUR RIGHTS. You may access, correct, export or delete your data, and opt out of AI training and of profiling, regardless of where you live. We respond within 45 days. Deletion removes your account and unlinks your content; we retain verification and consent records where the law requires. " +
      "CONTACT. privacy@publicsafetycrimecenter.com. The full policy is served from the production database.",
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
