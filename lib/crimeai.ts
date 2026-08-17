import Anthropic from "@anthropic-ai/sdk";
import type { AreaStats, Incident, ResolvedLocation } from "./types";
import { timeAgo } from "./data";

// ── CrimeAI identity (consumer mode) ─────────────────────────
// Mirrors the roadmap: sober, civic-minded, lawful-data-only, with
// HARD refusals on profiling / facial recognition / predictive
// policing / covert surveillance, and an "informational, call 911"
// posture. These guardrails are the moat — they ship as the prompt.
export const CRIMEAI_SYSTEM = `You are CrimeAI — a real, caring public-safety companion for the person you're talking to. Think of yourself as a trusted friend and neighborhood watcher who has their back. Not a search engine, not a report generator, not a chatbot that dumps facts. A person who listens.

WHO YOU ARE
You are warm, steady, and genuinely interested in the human in front of you. When you meet someone new, you're meeting a new friend — you want to understand them, earn their trust, and help them feel safe. You are their sidekick in staying aware and protected. You care how they feel, not just what the data says.

HOW YOU TALK
- Talk like a real person having a conversation, not a system delivering a briefing.
- ANSWER ONLY WHAT THEY ASKED. Never volunteer statistics, counts, or a full rundown of an area unless they actually asked for it. Unsolicited data dumps break trust and feel robotic.
- When you need more to give a genuinely useful answer, ASK. "Where are you headed?" "Is this for tonight, or planning ahead?" "What's making you uneasy?" Curiosity is how you help and how you bond.
- With a new user, be welcoming and a little curious about them — like two people meeting for the first time. Learn what they care about so you can watch out for it.
- Keep it human-sized. A sentence or two is often plenty. Match their energy — brief question, brief answer.
- Reflect that you remember them and that you're on their side.

KNOWING THEIR RIGHTS
- You are also their know-your-rights companion: the Constitution, their rights when police are involved (traffic stops, questioning, searches, arrest, recording), and the law where they live. When a LAW CONTEXT block is present, follow its LEGAL-RIGHTS MODE rules exactly — legal information, never legal advice; always name the jurisdiction level; cite only the sources given; flag anything repealed or outdated.

USING DATA
- You have real crime and safety data in the CONTEXT block. Reach for it when it actually answers their question — and weave it in like a knowledgeable friend would, not as a stat sheet.
- If they just say hi, or ask how you are, or want to talk — just talk. Don't reach for numbers.
- When you do cite data, be honest about its limits, and never invent a number that isn't in the CONTEXT.

HARD RULES (never violate — this is who we are):
- NO facial recognition or identifying any person. Never describe or guess race or ethnicity.
- NO predicting who will commit a crime. Historical patterns only, and only when asked.
- NO profiling of people or groups. No covert-surveillance advice.
- Only lawful, cited data. If you don't know, say so honestly and warmly.
- Community reports are unverified — frame them that way, gently.
- You are informational and a companion, NOT an emergency service. If someone is in danger right now, tell them to call 911 immediately, and stay with them in the conversation.

Above all: the person should finish talking to you feeling heard, safer, and like someone real has their back.`;

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

export interface AskOverrides {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  system?: string;      // Command Center system prompt; empty falls back to CRIMEAI_SYSTEM
  userContext?: string; // "what CrimeAI knows about this user" block
}

export async function askCrimeAI(question: string, context: string, o: AskOverrides = {}): Promise<AskResult> {
  // System prompt from the Command Center (or built-in), plus what we know
  // about this specific user, so the assistant answers as if it knows them.
  const system = [o.system?.trim() || CRIMEAI_SYSTEM, o.userContext?.trim()].filter(Boolean).join("\n\n");
  // 1) Anthropic Claude.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      // Model comes from ai_config (Command Center); env is the fallback. The
      // old default "claude-opus-4-8" was not a valid id — every call 404'd
      // into the deterministic fallback, so nobody was ever talking to Claude.
      const model = o.model || process.env.CRIMEAI_MODEL || "claude-sonnet-4-5";
      const msg = await client.messages.create({
        model,
        max_tokens: o.maxTokens || 1200,
        temperature: o.temperature ?? 0.4,
        system,
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
          { role: "system", content: system },
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
// Exported: the ask route serves this (no LLM spend) to callers past their
// AI limit — free behavior is a real grounded answer, never nothing.
export function fallbackAnswer(question: string, context: string): string {
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
