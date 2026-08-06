// GET /api/push/diagnose — push credential self-test.
//
// Proves APNs and FCM credentials without a device: probes each provider with
// a fake token and reports whether auth succeeded. See lib/push/diagnose.ts.
//
// Guarded by the same PUSH_EVENT_SECRET the database triggers use, so there is
// no new secret to manage. It reports key IDs and the service-account email —
// identifiers, never the .p8 or the private_key.

import { NextRequest, NextResponse } from "next/server";
import { diagnose } from "@/lib/push/diagnose";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const secret = process.env.PUSH_EVENT_SECRET;
  const given = req.headers.get("x-push-secret") || new URL(req.url).searchParams.get("secret");
  if (!secret || given !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await diagnose();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
