import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";

// POST { text } -> audio/mpeg. Protector-only. Not separately metered — it's
// the spoken half of a voice turn already counted at transcribe. Requires a
// signed-in Protector; free/anon are declined so TTS cost can't be farmed.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Sign in." }, { status: 401 });

  // gate on plan (Protector) without consuming a meter unit.
  // planLimitFor returns null when enforcement is disabled / fail-open — the
  // SAME mode in which /voice/transcribe (enforceConsume) returns allowed. So
  // null must ALLOW here too; only a concrete non-positive limit is a real
  // "not entitled". (Previously `!cap` treated null as denied, which 402'd
  // every voice reply whenever the kill-switch was off — i.e. always, on prod.)
  const { planLimitFor } = await import("@/lib/entitlements/request");
  const cap = await planLimitFor(userId, "ai_voice");
  if (cap != null && Number(cap) <= 0) return NextResponse.json({ error: "Voice is a Protector feature.", upsell: true }, { status: 402 });

  const { text } = await req.json().catch(() => ({}));
  if (!text || typeof text !== "string") return NextResponse.json({ error: "No text." }, { status: 400 });

  try {
    const { gateway } = await import("@/lib/ai/gateway");
    const tts = gateway.tts();
    if (!tts.configured) return NextResponse.json({ error: "Voice isn't available right now." }, { status: 503 });
    const { audio, contentType } = await tts.synthesize(text);
    return new NextResponse(audio, { headers: { "Content-Type": contentType, "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
