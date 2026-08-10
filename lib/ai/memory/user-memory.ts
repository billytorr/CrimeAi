// User Memory — durable per-user facts CrimeAI remembers across conversations
// (master-prompt §16). Server-side, own-data-only, never cross-user.
//
// Writes are gated by a blocklist so sensitive categories can never be stored,
// even if an extraction misfires — memory holds preferences and context, not PII.

import { serverDb } from "@/lib/payments/serverdb";

export interface MemoryFact { id: string; fact: string; source: string; createdAt: string }

// A fact touching any of these is refused — memory must never become a place
// biometric/ID/payment/precise-location data leaks into.
const BLOCKED = /\b(ssn|social security|passport|driver'?s? licen|credit card|card number|cvv|bank account|routing number|date of birth|\bdob\b|face|biometric|fingerprint|home address|street address|\bapt\b|apartment \d)/i;

export function isStorableFact(fact: string): boolean {
  const f = fact.trim();
  if (f.length < 3 || f.length > 280) return false;
  if (BLOCKED.test(f)) return false;
  return true;
}

export async function getMemory(userId: string, limit = 50): Promise<MemoryFact[]> {
  try {
    const db = serverDb(true);
    const { data } = await db.from("crimeai_user_memory")
      .select("id, fact, source, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    return (data || []).map((r: any) => ({ id: r.id, fact: r.fact, source: r.source, createdAt: r.created_at }));
  } catch { return []; }
}

/** Save a fact if storable. Silently no-ops on a blocked/duplicate fact. */
export async function saveMemory(userId: string, fact: string, source: "assistant" | "user" = "assistant"): Promise<boolean> {
  if (!isStorableFact(fact)) return false;
  try {
    const db = serverDb(true);
    const { error } = await db.from("crimeai_user_memory")
      .insert({ user_id: userId, fact: fact.trim(), source });
    return !error; // duplicate index violation → false, which is fine
  } catch { return false; }
}

export async function forgetMemory(userId: string, id: string): Promise<void> {
  try {
    const db = serverDb(true);
    await db.from("crimeai_user_memory").delete().eq("user_id", userId).eq("id", id);
  } catch { /* non-fatal */ }
}

/** Compact block for the assistant's context. Empty when nothing is remembered. */
export async function memoryContext(userId: string): Promise<string> {
  const facts = await getMemory(userId, 30);
  if (!facts.length) return "";
  return "WHAT YOU'VE REMEMBERED ABOUT THIS USER (from past chats — use naturally):\n" +
    facts.map((f) => `- ${f.fact}`).join("\n");
}

// ── extraction: pull a <remember>…</remember> tag out of an answer ──
// The assistant is instructed to emit at most one such tag when it learns a
// durable fact. We parse it server-side (pure, testable), save it, and strip
// it so the user never sees the tag. ZERO extra API calls.
export function extractMemory(answer: string): { cleaned: string; fact: string | null } {
  const m = /<remember>([\s\S]*?)<\/remember>/i.exec(answer);
  if (!m) return { cleaned: answer, fact: null };
  const fact = m[1].trim();
  const cleaned = answer.replace(m[0], "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, fact: fact || null };
}

export const MEMORY_INSTRUCTION =
  "\n\nMEMORY: if this exchange reveals a durable, non-sensitive fact worth remembering about the user (a lasting concern, a routine, a preference, a place they care about — never anything sensitive like an address, ID, or payment detail), emit exactly one tag at the very end: <remember>the fact in one short sentence</remember>. If nothing is worth remembering, emit nothing.";
