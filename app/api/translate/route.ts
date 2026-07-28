import { NextResponse } from "next/server";
import { LANG_NAME, type Lang } from "@/lib/i18n";

// POST /api/translate  { text, target }  → { translated }
// Per-post translation (the "See translation" option). Uses the same
// Anthropic model the CrimeAI assistant uses; falls back to 503 so the UI
// can quietly hide the option if translation isn't configured.
export const dynamic = "force-dynamic";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  try {
    const { text, target, source } = await req.json();
    if (!text || typeof text !== "string" || !target) {
      return NextResponse.json({ error: "text and target are required" }, { status: 400, headers: CORS });
    }
    const clean = text.slice(0, 2000);
    const targetName = LANG_NAME[target as Lang] || String(target);

    // 1) Best quality: the same Anthropic model the CrimeAI assistant uses.
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic();
        const msg = await client.messages.create({
          model: process.env.CRIMEAI_MODEL || "claude-opus-4-8",
          max_tokens: 1024,
          system:
            `You are a translation engine for a neighborhood safety app. Translate the user's post into ${targetName}. ` +
            `Preserve meaning, tone, slang, hashtags, @mentions, emojis and line breaks. ` +
            `If it is already in ${targetName}, return it unchanged. Output ONLY the translation — no quotes, no notes, no preamble.`,
          messages: [{ role: "user", content: clean }],
        });
        const translated = (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
        if (translated) return NextResponse.json({ translated, engine: "anthropic" }, { headers: CORS });
      } catch { /* fall through to the keyless service */ }
    }

    // 2) Keyless fallback (works with zero configuration): MyMemory free API.
    try {
      const src = (source as string) || "en";
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${src}|${target}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const data = (await res.json()) as any;
      const translated = data?.responseData?.translatedText;
      if (res.ok && translated && typeof translated === "string") {
        return NextResponse.json({ translated, engine: "mymemory" }, { headers: CORS });
      }
    } catch { /* fall through */ }

    return NextResponse.json({ error: "Translation is not available right now." }, { status: 503, headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS });
  }
}
