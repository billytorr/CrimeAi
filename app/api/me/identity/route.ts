import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";

// GET /api/me/identity — the caller's own identity trust status, for
// RENDERING ONLY (a future Settings "Trust level" card). Identity never
// gates posting, reporting, or safety features (Rules 1/3).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);
  const { data } = await db.from("identity_status")
    .select("level, email_verified, phone_verified, device_attested, geo_consistent, verified_at, expires_at")
    .eq("user_id", userId).maybeSingle();
  return NextResponse.json({
    level: data?.level ?? 0,
    factors: {
      email: data?.email_verified ?? false,
      phone: data?.phone_verified ?? false,      // pending Twilio Verify
      device: data?.device_attested ?? false,    // pending native attestation
      geo: data?.geo_consistent ?? false,
    },
    expiresAt: data?.expires_at ?? null,
  });
}
