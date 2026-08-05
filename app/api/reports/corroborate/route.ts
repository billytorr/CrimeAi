import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";
import { recordCorroboration } from "@/lib/scoring/guardian-service";

// POST /api/reports/corroborate { reportId }
// "I saw this too" — advances the report's verification pipeline and queues
// the corroborator's PENDING earning (vests when the window closes).
// Velocity-limited; own reports excluded; one corroboration per user/report.
// NOTE: corroborating is a community feature, never a gate on anything.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { reportId } = await req.json();
    if (!reportId || typeof reportId !== "string") {
      return NextResponse.json({ error: "reportId is required" }, { status: 400 });
    }
    const r = await recordCorroboration(userId, reportId);
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
