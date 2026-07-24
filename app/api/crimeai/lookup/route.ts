import { NextRequest, NextResponse } from "next/server";
import { resolveAddress } from "@/lib/geocode";
import { computeStats, incidentsNear } from "@/lib/data";
import { liveIncidentsNear } from "@/lib/ingest/live";

// POST /api/crimeai/lookup
// { address, radiusMiles?, days? } -> resolved location + area stats + recent incidents
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, radiusMiles = 1, days = 30 } = body || {};
    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }
    const loc = await resolveAddress(address);
    if (!loc) {
      return NextResponse.json(
        { error: "Could not resolve that address. Try a neighborhood, city, ZIP, or street address." },
        { status: 422 }
      );
    }
    const live = await liveIncidentsNear(loc.lat, loc.lon, radiusMiles);
    const stats = computeStats({ lat: loc.lat, lon: loc.lon, radiusMiles, days, live });
    const recent = incidentsNear({ lat: loc.lat, lon: loc.lon, radiusMiles, days, live })
      .slice(0, 25);
    return NextResponse.json({ location: loc, stats, recent, radiusMiles, days });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
