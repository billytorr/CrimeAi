import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";
import { getMemory, saveMemory, forgetMemory } from "@/lib/ai/memory/user-memory";

// GET  -> what CrimeAI remembers about you
// POST { fact } -> add a memory (source: user)
// DELETE { id } -> forget one
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ memory: await getMemory(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { fact } = await req.json().catch(() => ({}));
  const ok = await saveMemory(userId, String(fact || ""), "user");
  return NextResponse.json({ ok });
}

export async function DELETE(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  await forgetMemory(userId, String(id || ""));
  return NextResponse.json({ ok: true });
}
