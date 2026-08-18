// CrimeAI legal-rights companion — assembles the LAW CONTEXT for a question.
//
//   baked-in foundation (Constitution, settled SCOTUS rights, verified FL layer)
//   + live retrieval from official government sources for the user's jurisdiction
//   → one context block + one instruction block, injected by /api/crimeai/ask.

import { matchKnowledge, looksLegal, type LawEntry } from "./knowledge";
import { retrieveLaw, formatLawHits, type Jurisdiction } from "./retrieve";

export { looksLegal };

// How CrimeAI must handle law. Legal INFORMATION, never legal ADVICE — the
// line that keeps a safety app out of unauthorized-practice-of-law territory
// while still genuinely protecting the user.
export const LAW_INSTRUCTION = `
LEGAL-RIGHTS MODE — this question touches the law or a police encounter. Follow these rules exactly:
- You provide legal INFORMATION and know-your-rights guidance, NOT legal advice. You do not predict case outcomes, tell someone whether they will win, or tell them to break or ignore a law. When the stakes are personal (a charge, a lawsuit, an arrest), say plainly that a licensed attorney in their state should review their specific situation, and how to reach one (public defender at arraignment, state bar referral, legal aid).
- ALWAYS state the jurisdiction level: say whether something is FEDERAL (Constitution, U.S. Code, Supreme Court), STATE, or LOCAL (county/city ordinance), and which state/city you're describing. Laws differ by state and city — never present one state's rule as universal.
- Cite the source for anything you state as law, from the LAW CONTEXT (statute section, amendment, or case). Never invent a statute number or case. If the context has no source for a claim, say you're not certain and point them to the official code.
- ACTIVE vs NO LONGER ACTIVE: only present law as current if the context shows it current. If a source is flagged REPEALED/INACTIVE or HISTORIC, say so explicitly ("that law was repealed / that's an old version") and don't rely on it. Laws change — remind them to verify anything critical against the official source you cite.
- POLICE ENCOUNTERS — the practical script, always: stay calm, keep hands visible, comply physically, assert rights VERBALLY. Key phrases: "Am I being detained, or am I free to go?" · "I do not consent to a search." · "I'm exercising my right to remain silent." · "I want a lawyer." Don't argue legality on the roadside — comply, remember, and contest later in court. Never advise physically resisting.
- Recording police in public is generally protected; don't interfere with the officer.
- If they are in danger RIGHT NOW, tell them to call 911 first.
- Be warm and steady — this person may be scared. Short, clear, human. Lead with what they most need to know right now.
- DON'T DUMP THE LAW. The LAW CONTEXT may hold many entries — that is your reference shelf, not your script. Pick the ONE that answers what they asked, say it in a sentence or two with its citation, then ASK what you need to know to help further (where they are, what stage they're at, what was said). Never recite multiple statutes or cases in one reply unless they ask for the full picture. A person in a serious moment needs one clear thing, not a briefing.
`.trim();

function formatKnowledge(entries: LawEntry[]): string {
  return entries.map((e, i) =>
    `${i + 1}. [${e.scope.toUpperCase()} · ${e.jurisdiction} · ${e.status}] ${e.title}\n   ${e.summary}\n   Source: ${e.source} (verified ${e.asOf})`
  ).join("\n");
}

export interface LawContextResult { context: string; used: boolean; sources: string[] }

// Build the LAW CONTEXT block. Cheap when the question isn't legal (returns
// nothing). Live retrieval is time-boxed and best-effort — the baked-in
// foundation always answers even if search is slow/unavailable.
export async function buildLawContext(question: string, j: Jurisdiction, opts: { live?: boolean; timeoutMs?: number; force?: boolean } = {}): Promise<LawContextResult> {
  if (!opts.force && !looksLegal(question)) return { context: "", used: false, sources: [] };

  const baked = matchKnowledge(question, j.state, 3);
  let liveBlock = "";
  const sources: string[] = baked.map((e) => e.source);

  if (opts.live !== false) {
    const timeout = new Promise<[]>((r) => setTimeout(() => r([]), opts.timeoutMs ?? 6000));
    const hits = await Promise.race([retrieveLaw(question, j), timeout]);
    if (hits.length) {
      liveBlock = formatLawHits(hits);
      sources.push(...hits.map((h) => h.url));
    }
  }

  const where = [j.city, j.county, j.state].filter(Boolean).join(", ") || "United States";
  const parts = [
    `LAW CONTEXT — user's jurisdiction: ${where}. Cite ONLY from here; nothing else is a source.`,
    baked.length ? `Foundation (settled law, verified):\n${formatKnowledge(baked)}` : "",
    liveBlock ? `Live official sources for this jurisdiction (checked just now — note any REPEALED/HISTORIC flags):\n${liveBlock}` : "",
    !baked.length && !liveBlock ? "No matching sources found. Say so, give the general constitutional framework only if clearly applicable, and direct them to the official state statutes and a licensed attorney." : "",
  ].filter(Boolean);

  return { context: parts.join("\n\n"), used: true, sources };
}
