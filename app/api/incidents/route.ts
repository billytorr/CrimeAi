import { NextRequest, NextResponse } from "next/server";
import { incidentsNear } from "@/lib/data";

// GET /api/incidents?lat=&lon=&radius=&days=&categories=&sources=
// Map + feed data for the area around the user.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get("lat") || "");
  const lon = parseFloat(sp.get("lon") || "");
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }
  const radiusMiles = parseFloat(sp.get("radius") || "1.5");
  const days = parseInt(sp.get("days") || "30", 10);
  const categories = sp.get("categories")?.split(",").filter(Boolean);
  const sources = sp.get("sources")?.split(",").filter(Boolean);
  const minSeverity = sp.get("minSeverity") ? parseInt(sp.get("minSeverity")!, 10) : undefined;

  const incidents = incidentsNear({ lat, lon, radiusMiles, days, categories, sources, minSeverity });
  return NextResponse.json({ incidents, count: incidents.length });
}
