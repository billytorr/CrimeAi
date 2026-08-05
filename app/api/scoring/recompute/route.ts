import { NextRequest, NextResponse } from "next/server";
import { computeAllNSS, recomputeAndPersistNSS, divergenceTable } from "@/lib/scoring/service";

// GET /api/scoring/recompute — recompute the PARALLEL NSS for every area and
// persist to area_scores (+history). The legacy Safety Score is untouched;
// nothing user-facing reads these tables yet (Phase 4: parallel run only).
//
// Auth mirrors the reconcile cron: Vercel Cron sends Bearer CRON_SECRET;
// manual runs may pass ?key=<RECONCILE_SECRET|service key>.
// ?divergence=1 also returns the old-vs-new table (no writes for that part).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const key = req.nextUrl.searchParams.get("key") || "";
  if (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) return true;
  const manual = process.env.RECONCILE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!manual && (key === manual || bearer === manual);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const wantDivergence = req.nextUrl.searchParams.get("divergence") === "1";
    const summary = await recomputeAndPersistNSS();

    // Guardian pipeline (Phases 7+8): queue new report earnings, settle vested
    // events, recompute affected scores (fail-soft — never blocks NSS).
    let guardian: unknown = null;
    try {
      const { queueNewReportEvents, settleAndRecompute } = await import("@/lib/scoring/guardian-service");
      const queued = await queueNewReportEvents();
      guardian = { queued, ...(await settleAndRecompute()) };
    } catch (e) {
      guardian = { error: (e as Error).message };
    }

    // Block Strength (Phase 9) — participation only, never crime data.
    let blockStrength: unknown = null;
    try {
      const { recomputeBlockStrength } = await import("@/lib/scoring/block-service");
      blockStrength = await recomputeBlockStrength();
    } catch (e) {
      blockStrength = { error: (e as Error).message };
    }

    if (!wantDivergence) return NextResponse.json({ ok: true, ...summary, guardian, blockStrength });
    const computations = await computeAllNSS();
    return NextResponse.json({ ok: true, ...summary, guardian, divergence: divergenceTable(computations) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
