import { NextRequest, NextResponse } from "next/server";
import { resolveAddress } from "@/lib/geocode";
import { computeStats, incidentsNear, insideMiamiCoverage, NEIGHBORHOODS } from "@/lib/data";
import { askCrimeAI, buildContext } from "@/lib/crimeai";
import { liveIncidentsNear } from "@/lib/ingest/live";
import type { ResolvedLocation } from "@/lib/types";

// POST /api/crimeai/ask
// { question, address? | lat,lon,neighborhood?, radiusMiles?, days? }
// -> location-aware, grounded CrimeAI answer.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, address, lat, lon, neighborhood, radiusMiles = 1, days = 30 } = body || {};
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

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
    const { answer, engine } = await askCrimeAI(question, context);

    return NextResponse.json({ answer, engine, location: loc, stats });
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
