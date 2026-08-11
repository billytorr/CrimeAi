import { NextRequest, NextResponse } from "next/server";

// CrimeAI summary of a news article for the in-app reader. Fast model, safety
// lens, honest about summarizing from the headline/description. Falls back to
// the article's own description if the LLM isn't available.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { title, description, source } = await req.json().catch(() => ({}));
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const fallback = (description || title) as string;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ summary: fallback, engine: "none" });
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: process.env.CRIMEAI_VOICE_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 320,
      temperature: 0.3,
      system:
        "You are CrimeAI. Summarize this local news article for a resident in 2–4 short, clear sentences, focused on what it means for their safety and any practical takeaway. Warm and direct. Do NOT invent facts beyond the headline and description — if detail is thin, say what's known and suggest reading the full article for specifics.",
      messages: [{ role: "user", content: `HEADLINE: ${title}\nSOURCE: ${source || "(unknown)"}\nDESCRIPTION: ${description || "(none provided)"}` }],
    });
    const summary = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    return NextResponse.json({ summary: summary || fallback, engine: "anthropic" });
  } catch {
    return NextResponse.json({ summary: fallback, engine: "fallback" });
  }
}
