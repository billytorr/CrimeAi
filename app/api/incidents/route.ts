import { NextRequest, NextResponse } from "next/server";
import { incidentsNear } from "@/lib/data";
import { liveIncidentsNear } from "@/lib/ingest/live";
import { resolveUserId, planLimitFor, clampDays } from "@/lib/entitlements/request";

// GET /api/incidents?lat=&lon=&radius=&days=&categories=&sources=
// Map + feed data for the area around the user.
// Entitlements: the lookback window is clamped to the plan's map_history_days
// (kill-switch governed; anonymous callers get the free plan's window).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get("lat") || "");
  const lon = parseFloat(sp.get("lon") || "");
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }
  const radiusMiles = parseFloat(sp.get("radius") || "1.5");
  const userId = await resolveUserId(req);
  const maxDays = await planLimitFor(userId, "map_history_days");
  const days = clampDays(parseInt(sp.get("days") || "30", 10), maxDays);
  const categories = sp.get("categories")?.split(",").filter(Boolean);
  const sources = sp.get("sources")?.split(",").filter(Boolean);
  const minSeverity = sp.get("minSeverity") ? parseInt(sp.get("minSeverity")!, 10) : undefined;

  const live = await liveIncidentsNear(lat, lon, radiusMiles);
  const incidents = incidentsNear({ lat, lon, radiusMiles, days, categories, sources, minSeverity, live });
  return NextResponse.json({ incidents, count: incidents.length, live: live.length >= 3 });
}
