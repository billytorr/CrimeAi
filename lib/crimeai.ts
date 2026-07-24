import Anthropic from "@anthropic-ai/sdk";
import type { AreaStats, Incident, ResolvedLocation } from "./types";
import { timeAgo } from "./data";

// ── CrimeAI identity (consumer mode) ─────────────────────────
// Mirrors the roadmap: sober, civic-minded, lawful-data-only, with
// HARD refusals on profiling / facial recognition / predictive
// policing / covert surveillance, and an "informational, call 911"
// posture. These guardrails are the moat — they ship as the prompt.
export const CRIMEAI_SYSTEM = `You are CrimeAI, the public-safety intelligence specialist behind PSCC (Public Safety Crime Center). You are speaking to a consumer who wants to understand safety around the specific address given in the CONTEXT block (anywhere in the US; Miami is the beta's home market with the deepest coverage).

VOICE: Sober, civic-minded, plain-spoken, calm. You are a trusted neighborhood briefer, not an alarmist. Never sensationalize. Keep answers tight (2-5 short paragraphs or a few bullets). Always ground claims in the DATA you are given — cite real numbers, neighborhoods, time patterns, and sources.

HARD RULES (never violate, these are the product's moat):
- NO facial recognition or identifying any person. Never describe or guess race or ethnicity.
- NO predictive policing ("X person/group will commit a crime"). Describe historical patterns only.
- NO profiling of individuals or groups. No covert-surveillance advice.
- Lawful, cited data only. If you don't have data for something, say so plainly.
- Low-confidence/community-sourced reports must be framed as unverified community reports, not facts.
- You are INFORMATIONAL. For any active emergency, tell the user to call 911 themselves.

WHEN ANSWERING:
- Lead with a direct answer to the question.
- Use the real numbers from the CONTEXT block (counts, time-of-day, top categories, trend, safety score, sources).
- Note the data's limits honestly (coverage depth varies by area; some sources are community-reported or modeled).
- Offer one or two concrete, non-paranoid safety suggestions when relevant.
- Never invent incidents or numbers that aren't in the CONTEXT.`;

export function buildContext(loc: ResolvedLocation, stats: AreaStats, recent: Incident[], radiusMiles: number, days: number): string {
  const cats = Object.entries(stats.byCategory)
    .map(([c, n]) => `${c}: ${n}`)
    .join(", ");
  const topTypes = stats.byType.slice(0, 5).map((t) => `${t.type} (${t.count})`).join(", ");
  const sources = stats.bySource.map((s) => `${s.label} (${s.count})`).join(", ");
  const peakHour = stats.hourHistogram.indexOf(Math.max(...stats.hourHistogram));
  const recentLines = recent
    .slice(0, 8)
    .map((i) => `- ${i.type} (sev ${i.severity}/5) at ${i.block}, ${i.neighborhood}, ${timeAgo(i.occurred_at)}, source: ${i.source_label}${i.verified ? "" : " [unverified community report]"}`)
    .join("\n");

  const place = [loc.neighborhood, loc.city, loc.state].filter(Boolean).join(", ");
  const isMiami = loc.city === "Miami";
  return `CONTEXT (real data — use these numbers, do not invent others)
Location: ${place} (lat ${loc.lat.toFixed(4)}, lon ${loc.lon.toFixed(4)})
Window: last ${days} days within ${radiusMiles} mile(s).
Total incidents: ${stats.total}
By category: ${cats || "none"}
Top types: ${topTypes || "none"}
Safety score: ${stats.safetyScore}/100 (higher is safer)
Vs city average density: ${stats.cityComparisonPct >= 0 ? "+" : ""}${stats.cityComparisonPct}%
Last 7 days: ${stats.last7} incidents (previous 7: ${stats.prev7}, trend ${stats.trendPct >= 0 ? "+" : ""}${stats.trendPct}%)
Night share (9pm-4am): ${stats.nightSharePct}%  | Peak hour: ${peakHour}:00
Sources contributing: ${sources || "none"}
Most recent incidents:
${recentLines || "(none in window)"}

${isMiami
    ? "Coverage note for Miami: open-data layer is strong (Miami-Dade + City of Miami); scanner audio is hybrid (partial real-time); Nextdoor/community posts are unverified and weighted lowest."
    : "Coverage note: this area is outside the Miami beta market — figures come from the PSCC crime model plus any community reports, and should be framed as modeled estimates, not verified open-data counts."}`;
}

interface AskResult {
  answer: string;
  engine: "anthropic" | "ollama" | "fallback";
}

export async function askCrimeAI(question: string, context: string): Promise<AskResult> {
  // 1) Anthropic Claude — best for a live demo.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const model = process.env.CRIMEAI_MODEL || "claude-opus-4-8";
      const msg = await client.messages.create({
        model,
        max_tokens: 1024,
        system: CRIMEAI_SYSTEM,
        messages: [{ role: "user", content: `${context}\n\nUSER QUESTION: ${question}` }],
      });
      const answer = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (answer) return { answer, engine: "anthropic" };
    } catch (e) {
      // fall through to next engine
      console.error("Anthropic call failed, falling back:", (e as Error).message);
    }
  }

  // 2) Local Ollama (their existing torr-crimeai model).
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  try {
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "torr-crimeai",
        stream: false,
        messages: [
          { role: "system", content: CRIMEAI_SYSTEM },
          { role: "user", content: `${context}\n\nUSER QUESTION: ${question}` },
        ],
      }),
      // Don't hang the demo if Ollama isn't running.
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const answer = (data.message?.content || "").trim();
      if (answer) return { answer, engine: "ollama" };
    }
  } catch {
    // fall through
  }

  // 3) Deterministic grounded fallback — never let the demo go silent.
  return { answer: fallbackAnswer(question, context), engine: "fallback" };
}

// A grounded, template-based answer built straight from the context block.
function fallbackAnswer(question: string, context: string): string {
  const get = (label: string) => context.match(new RegExp(`${label}: (.+)`))?.[1]?.trim() ?? "";
  const safety = get("Safety score");
  const total = get("Total incidents");
  const cats = get("By category");
  const top = get("Top types");
  const night = get("Night share \\(9pm-4am\\)");
  const trend = get("Last 7 days");
  const cmp = get("Vs city average density");
  const loc = get("Location");

  return [
    `Here's the grounded picture for ${loc.split(" (")[0]}.`,
    `Over the window I'm looking at, there were ${total} reported incidents nearby. Safety score: ${safety}, and the area runs ${cmp} versus the city average density.`,
    `The mix breaks down as ${cats}. The most common reports are ${top}. Time-of-day matters here: night share is ${night}, so the late-evening hours carry more activity.`,
    `Recent momentum — ${trend}.`,
    `A couple of practical notes: stay aware during the peak late hours, keep vehicles emptied of valuables (vehicle break-ins are a recurring pattern in most neighborhoods), and treat community-sourced reports as unverified until corroborated. This is informational only — for anything happening right now, call 911 yourself.`,
  ].join("\n\n");
}
