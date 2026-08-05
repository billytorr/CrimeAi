import { NextResponse } from "next/server";
import { loadScoringConfig } from "@/lib/scoring/config";
import { buildMethodology } from "@/lib/scoring/methodology";
import { censusRelease } from "@/lib/scoring/census";

// GET /api/scoring/methodology — the PUBLIC NSS methodology, generated from
// the live scoring config on every request so it can never drift from the
// actual computation. Markdown; no auth (transparency is the point).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cfg = await loadScoringConfig();
    return new NextResponse(buildMethodology(cfg.nss, censusRelease()), {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
