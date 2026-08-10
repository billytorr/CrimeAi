import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";
import { enforceConsume } from "@/lib/entitlements/enforce";

// POST /api/crimeai/vision  { image: dataURL|base64, prompt?, threadId? }
// Protector-only image/document analysis. Metered as ai_vision (cost path),
// so a heavy user can't run up unbounded inference cost.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Sign in to use image analysis." }, { status: 401 });

  const { image, prompt } = await req.json().catch(() => ({}));
  if (!image || typeof image !== "string") {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  // COST GATE + PAYWALL: ai_vision is 0 on free, so free users are declined
  // with an upsell rather than charged. enforceConsume fails closed on infra
  // error (Rule 3 exception for cost paths).
  const meter = await enforceConsume(userId, "ai_vision");
  if (!meter.allowed) {
    return NextResponse.json({
      error: "Image analysis is a Protector feature.",
      upsell: true,
    }, { status: 402 });
  }

  try {
    const { gateway } = await import("@/lib/ai/gateway");
    const vision = gateway.vision();
    if (!vision.configured) {
      return NextResponse.json({ error: "Image analysis isn't available right now." }, { status: 503 });
    }
    const { emitEvent } = await import("@/lib/ai/events");
    emitEvent("crimeai.tool.invoked", { tool: "vision.analyze" });
    const result = await vision.analyze(image, prompt);
    return NextResponse.json({
      answer: result.description,
      remaining: Number.isFinite(meter.remaining) ? meter.remaining : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
