import { NextResponse } from "next/server";
import { orchestrator } from "@/lib/ai/orchestrator";

// GET /api/crimeai/health — standalone health for CrimeAI Admin and a future
// TORR Mission Control. Public-safe: no secrets, no internal topology.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(orchestrator().health());
}
