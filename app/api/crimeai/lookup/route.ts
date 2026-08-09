import { NextRequest, NextResponse } from "next/server";

// LLM calls routinely exceed Vercel Hobby's 10s default; without this the
// function is killed mid-call and the app shows "Network error".
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { resolveAddress } from "@/lib/geocode";
import { computeStats, incidentsNear } from "@/lib/data";
import { liveIncidentsNear } from "@/lib/ingest/live";
import { resolveUserId, planLimitFor, clampDays, trimStatsForDepth } from "@/lib/entitlements/request";
import { enforceConsume, isEnforcementEnabled } from "@/lib/entitlements/enforce";

// POST /api/crimeai/lookup
// { address, radiusMiles?, days?, feature? } -> resolved location + area stats + recent incidents
//
// Entitlements: calls flagged `feature: "search"` (the Map's address-search
// box) consume the metered `address_search` allowance when enforcement is on.
// Location-bootstrap calls (onboarding home address, session start) are NOT
// metered — gating those would break signup. `days` is clamped to the plan's
// map history; stats trimmed to the plan's Safety Score depth.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, radiusMiles = 1, days: reqDays = 30, feature } = body || {};
    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const userId = await resolveUserId(req);
    if (feature === "search") {
      if (userId) {
        const meter = await enforceConsume(userId, "address_search");
        if (!meter.allowed) {
          return NextResponse.json(
            { error: "Address search is a Protector feature.", upgrade: true, remaining: 0 },
            { status: 403 },
          );
        }
      } else if (await isEnforcementEnabled()) {
        return NextResponse.json({ error: "Sign in to search addresses." }, { status: 401 });
      }
    }

    const [maxDays, depth] = await Promise.all([
      planLimitFor(userId, "map_history_days"),
      planLimitFor(userId, "safety_score_depth"),
    ]);
    const days = clampDays(reqDays, maxDays);

    const loc = await resolveAddress(address);
    if (!loc) {
      return NextResponse.json(
        { error: "Could not resolve that address. Try a neighborhood, city, ZIP, or street address." },
        { status: 422 }
      );
    }
    const live = await liveIncidentsNear(loc.lat, loc.lon, radiusMiles);
    const legacyStats = computeStats({ lat: loc.lat, lon: loc.lon, radiusMiles, days, live });
    const recent = incidentsNear({ lat: loc.lat, lon: loc.lon, radiusMiles, days, live })
      .slice(0, 25);

    // CUTOVER: the Safety Score shown to users is the new NSS (fail-soft to
    // the legacy value). Scored over the NSS horizon, not the display window.
    const { withNSS, poolFor, nssIncidents } = await import("@/lib/scoring/overlay-helpers");
    const stats = await withNSS(legacyStats, {
      lat: loc.lat, lon: loc.lon, radiusMiles,
      incidents: await nssIncidents(loc.lat, loc.lon, radiusMiles, live),
      pool: poolFor(live, loc.lat, loc.lon),
    });

    return NextResponse.json({ location: loc, stats: trimStatsForDepth(stats, depth), recent, radiusMiles, days });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
