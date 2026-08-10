import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";
import { enforceConsume } from "@/lib/entitlements/enforce";

// POST { query, mode?: "search"|"research" } -> results. Protector-only,
// metered ai_web. search = Brave (fast), research = Tavily (deep + answer).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Sign in to search the web." }, { status: 401 });

  const meter = await enforceConsume(userId, "ai_web");
  if (!meter.allowed) return NextResponse.json({ error: "Web search is a Protector feature.", upsell: true }, { status: 402 });

  const { query, mode = "search" } = await req.json().catch(() => ({}));
  if (!query || typeof query !== "string") return NextResponse.json({ error: "No query." }, { status: 400 });

  try {
    const { gateway } = await import("@/lib/ai/gateway");
    const { emitEvent } = await import("@/lib/ai/events");
    if (mode === "research") {
      const r = gateway.research();
      if (!r.configured) return NextResponse.json({ error: "Research isn't available." }, { status: 503 });
      emitEvent("crimeai.tool.invoked", { tool: "web.research" });
      return NextResponse.json(await r.research(query));
    }
    const s = gateway.search();
    if (!s.configured) return NextResponse.json({ error: "Search isn't available." }, { status: 503 });
    emitEvent("crimeai.tool.invoked", { tool: "web.search" });
    return NextResponse.json({ results: await s.search(query) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
