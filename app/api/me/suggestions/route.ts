// GET /api/me/suggestions — who to follow.
//
// Official accounts (@crimeai) first, then public neighbours inside the
// radius the caller chose during onboarding, nearest first.
//
// The ordering and the privacy filtering both live in the SQL function
// (supabase/official-account.sql) rather than here, so a caller cannot
// widen the radius, reach private profiles, or reorder the results by
// tampering with query parameters.

import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";

export const dynamic = "force-dynamic";

export interface Suggestion {
  handle: string;
  name: string;
  photoUrl: string;
  neighborhood: string;
  distanceMiles: number | null;
  isOfficial: boolean;
}

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const asked = Number(new URL(req.url).searchParams.get("limit") || 20);
  const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 50) : 20;

  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);

  const { data, error } = await db.rpc("suggested_follows", { p_user: userId, p_limit: limit });
  if (error) {
    // Suggestions are a nicety — never let their failure block the app.
    console.error("[me/suggestions]", error.message);
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions: Suggestion[] = (data || []).map((r: any) => ({
    handle: r.handle,
    name: r.name || "Neighbor",
    photoUrl: r.photo_url || "",
    neighborhood: r.neighborhood || "",
    distanceMiles: r.distance_miles ?? null,
    isOfficial: !!r.is_official,
  }));

  return NextResponse.json({ suggestions });
}
