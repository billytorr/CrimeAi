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

  const fallback = (description || title) as string;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ summary: fallback, image, engine: "none" });
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: process.env.CRIMEAI_VOICE_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 320,
      temperature: 0.3,
      system:
        "You are CrimeAI. Summarize this local news article for a resident in 2–4 short, clear sentences focused on what it means for their safety and any practical takeaway. Warm and direct. Do NOT invent facts beyond what's provided — if detail is thin, say what's known and suggest reading the full article.",
      messages: [{ role: "user", content: `HEADLINE: ${title}\nSOURCE: ${source || "(unknown)"}\nCONTEXT: ${context || "(none provided)"}` }],
    });
    const summary = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    return NextResponse.json({ summary: summary || fallback, image, engine: "anthropic" });
  } catch {
    return NextResponse.json({ summary: fallback, image, engine: "fallback" });
  }
}
