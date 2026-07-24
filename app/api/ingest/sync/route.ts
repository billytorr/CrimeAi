import { NextRequest, NextResponse } from "next/server";
import { syncAllSources } from "@/lib/ingest/sync";

// POST/GET /api/ingest/sync — pull all enabled data sources into
// live_incidents. Called daily by Vercel cron (vercel.json) and on
// demand from Command Center → Sources → "Sync now".
//
// If SYNC_KEY is set in the environment, requests must carry it
// (Authorization: Bearer <key> — Vercel cron sends CRON_SECRET
// automatically when that env var exists). Without a key configured,
// the route stays open — syncing is idempotent and reads public data,
// so the worst an anonymous caller can do is refresh it.
export const maxDuration = 300;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST", "Access-Control-Allow-Headers": "authorization,content-type" };

function authorized(req: NextRequest) {
  const key = process.env.SYNC_KEY || process.env.CRON_SECRET;
  if (!key) return true;
  return req.headers.get("authorization") === `Bearer ${key}`;
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  try {
    const results = await syncAllSources();
    return NextResponse.json({ ok: true, results }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: CORS });
  }
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }
