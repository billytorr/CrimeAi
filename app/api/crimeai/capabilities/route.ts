import { NextResponse } from "next/server";
import { orchestrator } from "@/lib/ai/orchestrator";

// GET /api/crimeai/capabilities — the capability manifest, generated from
// what actually works. This is what CrimeAI would advertise to TORR at the
// handshake. No secrets.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(orchestrator().getCapabilities());
}
