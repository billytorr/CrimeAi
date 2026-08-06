import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";

// POST /api/push/register  { token, platform, environment?, appVersion? }
// DELETE /api/push/register?token=…
//
// The native shell registers its APNs/FCM token here after the user grants
// notification permission. Tokens rotate, so this upserts and refreshes
// last_seen_at on every app open.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { token, platform, environment, appVersion } = await req.json();
    if (!token || typeof token !== "string") return NextResponse.json({ error: "token required" }, { status: 400 });
    if (!["ios", "android", "web"].includes(platform)) return NextResponse.json({ error: "invalid platform" }, { status: 400 });

    const { serverDb } = await import("@/lib/payments/serverdb");
    const db = serverDb(true);
    const { error } = await db.from("device_tokens").upsert({
      token, user_id: userId, platform,
      environment: environment === "sandbox" ? "sandbox" : "production",
      app_version: appVersion ?? null,
      last_seen_at: new Date().toISOString(),
      disabled_at: null,           // re-registering revives a previously dead token
    }, { onConflict: "token" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);
  await db.from("device_tokens").delete().eq("token", token).eq("user_id", userId);
  return NextResponse.json({ ok: true });
}
