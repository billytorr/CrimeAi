import { NextResponse } from "next/server";
import { agentManifest } from "@/lib/ai/agents/registry";

// GET /api/crimeai/agents — the agents CrimeAI exposes, for CrimeAI Admin and
// a future TORR handshake. No secrets.
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ agents: agentManifest() });
}
