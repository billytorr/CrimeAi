import { NextRequest, NextResponse } from "next/server";

// Article detail for the in-app reader: a CrimeAI summary PLUS a high-res image.
// Brave's card thumbnail is tiny and blurs when enlarged, so we fetch the
// article page once for its og:image (typically ~1200px) and its richer meta
// description, then summarize with a safety lens. Everything is best-effort
// with graceful fallbacks — the reader always gets *something* to show.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function meta(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"),
  ];
  for (const re of patterns) { const m = html.match(re); if (m) return m[1]; }
  return null;
}

export async function POST(req: NextRequest) {
  const { title, description, source, url } = await req.json().catch(() => ({}));
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  let image: string | null = null;
  let context = (description || "") as string;

  if (url && /^https?:\/\//.test(url)) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CrimeAI/1.0; +https://publicsafetycrimecenter.com)" },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const html = (await r.text()).slice(0, 400_000);
        const og = meta(html, "og:image") || meta(html, "twitter:image");
        if (og && /^https?:\/\//.test(og)) image = og;
        const desc = meta(html, "og:description") || meta(html, "description");
        if (desc && desc.length > context.length) context = desc;
      }
    } catch { /* site blocked or slow — fall back to Brave data */ }
  }

  const fallback = stripMarkdown((description || title) as string);
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ summary: fallback, image, engine: "none" });
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: process.env.CRIMEAI_VOICE_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 320,
      temperature: 0.4,
      system:
        "You are CrimeAI, talking to a neighbor. In 2–4 short, natural sentences, tell them what this local news means for their safety and what to do about it. Sound like a real person giving a friend a heads-up — warm, calm, human. Begin IMMEDIATELY with your first real sentence: no title, no label, no heading, no 'Summary:' prefix. Plain text only — no markdown, no hashtags (#), no asterisks, no bullets, no bold. Just talk. Don't invent facts beyond what's provided.",
      messages: [{ role: "user", content: `HEADLINE: ${title}\nSOURCE: ${source || "(unknown)"}\nCONTEXT: ${context || "(none provided)"}` }],
    });
    const raw = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    return NextResponse.json({ summary: stripMarkdown(raw) || fallback, image, engine: "anthropic" });
  } catch {
    return NextResponse.json({ summary: fallback, image, engine: "fallback" });
  }
}

// Belt-and-suspenders: even with the plain-text instruction, strip any stray
// markdown so the reader never shows a literal "#" heading or "**bold**".
function stripMarkdown(s: string): string {
  return s
    .replace(/^#{1,6}\s*/gm, "")     // headings
    .replace(/\*\*?|__?/g, "")        // bold/italic
    .replace(/`+/g, "")               // code ticks
    .replace(/^\s*[-*•]\s+/gm, "")    // bullets
    // drop a leading title/label line (short, no sentence punctuation) that
    // Haiku sometimes adds despite instructions — e.g. "Safety Summary: …"
    .replace(/^\s*[^.!?\n]{1,70}\n+(?=[A-Z0-9])/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
