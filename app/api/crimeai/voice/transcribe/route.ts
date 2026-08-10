import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";
import { enforceConsume } from "@/lib/entitlements/enforce";

// POST audio (raw body) -> { text }. Protector-only, metered ai_voice.
// A voice turn is metered once here (the entry point); TTS on the reply is free.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Sign in to use voice." }, { status: 401 });

  const meter = await enforceConsume(userId, "ai_voice");
  if (!meter.allowed) return NextResponse.json({ error: "Voice is a Protector feature.", upsell: true }, { status: 402 });

  try {
    const audio = await req.blob();
    if (!audio.size) return NextResponse.json({ error: "No audio." }, { status: 400 });
    const { gateway } = await import("@/lib/ai/gateway");
    const stt = gateway.stt();
    if (!stt.configured) return NextResponse.json({ error: "Voice isn't available right now." }, { status: 503 });
    const { emitEvent } = await import("@/lib/ai/events");
    emitEvent("crimeai.tool.invoked", { tool: "voice.transcribe" });
    const { text } = await stt.transcribe(audio);
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
