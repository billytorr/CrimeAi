import { NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";

// Live-data status board for Command Center → Sources: per-source sync
// state + total ingested incidents. Names and counts only — no secrets.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" };

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

export async function GET() {
  try {
    const db = serverDb(true);
    const [{ data: sources }, { count }] = await Promise.all([
      db.from("data_sources").select("*").order("created_at"),
      db.from("live_incidents").select("incident_id", { count: "exact", head: true }),
    ]);
    const { data: latest } = await db.from("live_incidents")
      .select("occurred_at").order("occurred_at", { ascending: false }).limit(1).maybeSingle();
    return NextResponse.json({
      totalLive: count || 0,
      newestIncident: latest?.occurred_at || null,
      sources: sources || [],
    }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS });
  }
}
