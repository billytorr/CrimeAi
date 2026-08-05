import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { resolveUserId, planLimitFor } from "@/lib/entitlements/request";

// /api/locations — saved places (home, work, school…).
// GET    -> list the caller's saved locations
// POST   -> add one; the plan's saved_locations limit is enforced ATOMICALLY
//           in SQL (add_saved_location), so parallel adds can't exceed it.
// DELETE ?id= -> remove one of the caller's locations
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = serverDb(true);
  const { data, error } = await db.from("saved_locations")
    .select("id, label, address, lat, lon, neighborhood, created_at")
    .eq("user_id", userId).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const limit = await planLimitFor(userId, "saved_locations");
  return NextResponse.json({ locations: data || [], limit: limit == null ? null : Number(limit) });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { label, address, lat, lon, neighborhood } = await req.json();
    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    // null = enforcement off / fail-open → unlimited (-1)
    const limitVal = await planLimitFor(userId, "saved_locations");
    const limit = limitVal == null ? -1 : Number(limitVal);

    const db = serverDb(true);
    const { data, error } = await db.rpc("add_saved_location", {
      p_user: userId, p_label: String(label || ""), p_address: address,
      p_lat: typeof lat === "number" ? lat : null,
      p_lon: typeof lon === "number" ? lon : null,
      p_neighborhood: typeof neighborhood === "string" ? neighborhood : null,
      p_limit: Number.isFinite(limit) ? limit : -1,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.ok) {
      return NextResponse.json(
        { error: "You've reached your saved-places limit.", upgrade: true, total: row?.total ?? null },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true, id: row.loc_id, total: row.total });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const db = serverDb(true);
  const { error } = await db.from("saved_locations").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
