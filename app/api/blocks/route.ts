import { NextRequest, NextResponse } from "next/server";

// GET /api/blocks?area=<slug>  — Block Strength for one area
// GET /api/blocks?lat=&lon=    — nearest area's Block Strength
// Public read: Block Strength is a community-growth signal, not private data.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(false); // block_strength is world-readable

  let areaKey = sp.get("area");
  if (!areaKey) {
    const lat = parseFloat(sp.get("lat") || ""), lon = parseFloat(sp.get("lon") || "");
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return NextResponse.json({ error: "area or lat/lon required" }, { status: 400 });
    }
    const { listAreas } = await import("@/lib/scoring/service");
    const { milesApart } = await import("@/lib/scoring/geo");
    const nearest = listAreas()
      .map((a) => ({ a, d: milesApart(lat, lon, a.lat, a.lon) }))
      .sort((x, y) => x.d - y.d)[0];
    areaKey = nearest?.a.areaKey ?? null;
    if (!areaKey) return NextResponse.json({ error: "no area" }, { status: 404 });
  }

  const { data } = await db.from("block_strength").select("*").eq("area_key", areaKey).maybeSingle();
  if (!data) {
    return NextResponse.json({ areaKey, score: null, tier: null, message: "not computed yet" });
  }
  return NextResponse.json({
    areaKey,
    score: data.score,
    tier: data.tier,
    components: data.components,
    nextTier: data.next_tier,
    neighborsNeeded: data.neighbors_needed,
    temporalGapHours: data.explanation?.temporalGapHours ?? [],
    gaps: data.explanation?.gaps ?? [],
    computedAt: data.computed_at,
  });
}
