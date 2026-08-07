// /api/me/verification — the caller's ID-verification state.
//
// GET  → am I verified? is something pending? was I rejected, and why?
// POST → record BIPA consent and open a verification.
//
// ⚠️ No document, image or face template passes through this route or is
// stored by it. Files go to a private bucket referenced by path, purged
// within 24 hours (supabase/verification.sql). This route moves decisions.
//
// ⚠️ Consent is recorded BEFORE a verification row exists, and the exact
// text shown is stored verbatim. Illinois requires proof of what the
// person agreed to, not merely that they agreed.

import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/entitlements/request";
import { CONSENT_VERSION, CONSENT_TEXT } from "@/lib/identity/consent";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // FAIL CLOSED, but cleanly. If the database is unreachable we answer
  // "not verified" with a 200 rather than throwing a 500: the client treats
  // both the same (it also fails closed), and a 500 per page load just
  // buries real errors in noise. Refusing a report is recoverable; showing
  // a verified badge we could not confirm is not.
  try {
    const { serverDb } = await import("@/lib/payments/serverdb");
    const db = serverDb(true);

    const [{ data: verified }, { data: latest }] = await Promise.all([
      db.rpc("is_identity_verified", { p_user: userId }),
      db.from("identity_verifications")
        .select("status, reason, submitted_at, reviewed_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    return NextResponse.json({
      verified: !!verified,
      status: latest?.status ?? "none",
      reason: latest?.reason ?? null,
      submittedAt: latest?.submitted_at ?? null,
      reviewedAt: latest?.reviewed_at ?? null,
      // Tells the client whether capture can actually run yet.
      vendorConfigured: !!process.env.IDV_VENDOR,
      consentVersion: CONSENT_VERSION,
    });
  } catch (e) {
    console.error("[me/verification]", (e as Error).message);
    return NextResponse.json({
      verified: false, status: "unknown", reason: null,
      vendorConfigured: !!process.env.IDV_VENDOR, consentVersion: CONSENT_VERSION,
    });
  }
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const granted = body?.consent === true;

  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);

  // Record the decision either way — a refusal is also evidence, and it is
  // what stops us re-prompting someone who already said no.
  const { data: consent, error: consentErr } = await db.from("biometric_consents").insert({
    user_id: userId,
    policy_version: CONSENT_VERSION,
    consent_text: CONSENT_TEXT,
    granted,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    user_agent: req.headers.get("user-agent") || null,
  }).select("id").single();

  if (consentErr) {
    console.error("[me/verification] consent", consentErr.code, consentErr.message);
    // 42P01 = undefined_table. Distinguish "the migration was never applied"
    // from a genuine failure — they look identical to a user otherwise, and
    // the first is the far likelier explanation on a fresh environment.
    const notMigrated = consentErr.code === "42P01" || /does not exist/i.test(consentErr.message);
    return NextResponse.json({
      ok: false,
      error: notMigrated
        ? "Verification isn't set up on this environment yet (database migration pending)."
        : "Could not record consent — please try again.",
      code: notMigrated ? "not_migrated" : "consent_failed",
    }, { status: notMigrated ? 503 : 500 });
  }
  if (!granted) return NextResponse.json({ ok: true, declined: true });

  // No vendor yet: consent stands, but there is nothing to capture with.
  // Fail loudly rather than opening a verification that can never resolve.
  if (!process.env.IDV_VENDOR) {
    return NextResponse.json({
      ok: false,
      pendingVendor: true,
      message: "Identity verification isn't switched on yet. Your consent is saved — we'll let you know the moment it's available.",
    });
  }

  const { error } = await db.from("identity_verifications").insert({
    user_id: userId,
    status: "pending",
    method: "vendor",
    vendor: process.env.IDV_VENDOR,
    consent_id: consent.id,
    media_expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });
  // The partial unique index rejects a second in-flight attempt.
  if (error && /identity_verifications_one_pending/.test(error.message)) {
    return NextResponse.json({ ok: true, alreadyPending: true });
  }
  if (error) {
    console.error("[me/verification] submit", error.code, error.message);
    const notMigrated = error.code === "42P01" || /does not exist/i.test(error.message);
    return NextResponse.json({
      ok: false,
      error: notMigrated
        ? "Verification isn't set up on this environment yet (database migration pending)."
        : "Could not start verification — please try again.",
      code: notMigrated ? "not_migrated" : "submit_failed",
    }, { status: notMigrated ? 503 : 500 });
  }
  return NextResponse.json({ ok: true, status: "pending" });
}
