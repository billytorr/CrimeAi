import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";

// GET /api/me/guardian — the caller's Guardian Score, tier, and BOTH point
// balances (pending AND settled — Rule 11: vesting is visible). Read-only.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);
  const { data } = await db.from("guardian_scores").select("*").eq("user_id", userId).maybeSingle();
  return NextResponse.json({
    score: data?.score ?? 0,
    tier: data?.tier ?? "neighbor",
    accuracy: { verified: data?.verified_count ?? 0, rejected: data?.rejected_count ?? 0 },
    guardianPoints: { pending: data?.gs_pending ?? 0, settled: data?.gs_settled ?? 0 },
    watchPoints: { pending: data?.watch_pending ?? 0, settled: data?.watch_settled ?? 0 },
    explanation: data?.explanation ?? null,
    computedAt: data?.computed_at ?? null,
  });
}
