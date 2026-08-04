import { NextRequest, NextResponse } from "next/server";
import { resolveAddress } from "@/lib/geocode";
import { computeStats, incidentsNear, insideMiamiCoverage, NEIGHBORHOODS } from "@/lib/data";
import { askCrimeAI, buildContext, fallbackAnswer } from "@/lib/crimeai";
import { liveIncidentsNear } from "@/lib/ingest/live";
import { resolveUserId, planLimitFor, clampDays, trimStatsForDepth } from "@/lib/entitlements/request";
import { enforceConsume } from "@/lib/entitlements/enforce";
import type { ResolvedLocation } from "@/lib/types";

// POST /api/crimeai/ask
// { question, address? | lat,lon,neighborhood?, radiusMiles?, days? }
// -> location-aware, grounded CrimeAI answer.
//
// Entitlements: `ai_analytical` is a COST path — metered per user, always
// enforced (kill switch cannot open unbounded LLM spend). Over-limit and
// anonymous callers still get the grounded deterministic answer (free
// behavior is never nothing). `days` is clamped to the plan's map history;
// stats are trimmed to the plan's Safety Score depth.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, address, lat, lon, neighborhood, radiusMiles = 1, days: reqDays = 30 } = body || {};
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }
    const userId = await resolveUserId(req);
    const [maxDays, depth] = await Promise.all([
      planLimitFor(userId, "map_history_days"),
      planLimitFor(userId, "safety_score_depth"),
    ]);
    const days = clampDays(reqDays, maxDays);

    let loc: ResolvedLocation | null = null;
    if (typeof lat === "number" && typeof lon === "number") {
      // only claim Miami when the coords are actually in the Miami area
      const miami = insideMiamiCoverage(lat, lon);
      loc = {
        query: address || "current location",
        lat,
        lon,
        neighborhood: neighborhood || (miami ? nearest(lat, lon) : "this area"),
        city: miami ? "Miami" : "",
        state: miami ? "FL" : "",
        source: "gazetteer",
      };
    } else if (address) {
      loc = await resolveAddress(address);
    }
    if (!loc) {
      return NextResponse.json({ error: "Provide an address or lat/lon for grounding." }, { status: 422 });
    }

    const live = await liveIncidentsNear(loc.lat, loc.lon, radiusMiles);
    const stats = computeStats({ lat: loc.lat, lon: loc.lon, radiusMiles, days, live });
    const recent = incidentsNear({ lat: loc.lat, lon: loc.lon, radiusMiles, days, live });
    const context = buildContext(loc, stats, recent, radiusMiles, days);

    // COST GATE: only signed-in users within their metered allowance reach the
    // LLM. Everyone else gets the grounded deterministic answer at zero cost.
    let answer: string, engine: string;
    let ai: { limited: boolean; remaining?: number } = { limited: false };
    const meter = userId ? await enforceConsume(userId, "ai_analytical") : { allowed: false, remaining: 0 };
    if (meter.allowed) {
      ({ answer, engine } = await askCrimeAI(question, context));
      if (Number.isFinite(meter.remaining)) ai.remaining = meter.remaining;
    } else {
      answer = fallbackAnswer(question, context);
      engine = "fallback";
      ai = { limited: !!userId, remaining: 0 }; // anonymous isn't "limited", just ungrounded from LLM
    }

    return NextResponse.json({ answer, engine, ai, location: loc, stats: trimStatsForDepth(stats, depth) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function nearest(lat: number, lon: number): string {
  let best = NEIGHBORHOODS[0];
  let bestD = Infinity;
  for (const nb of NEIGHBORHOODS) {
    const d = (nb.lat - lat) ** 2 + (nb.lon - lon) ** 2;
    if (d < bestD) { bestD = d; best = nb; }
  }
  return best.name;
}
