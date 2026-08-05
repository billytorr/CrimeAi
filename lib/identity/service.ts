// IdentityService — orchestration for identity status (Phase 6: L0–L2).
// Level transitions are SERVER-side only; the client can read its own row.
//
// Rules 1/3 (CI-enforced): nothing here is ever called from posting,
// reporting, or safety paths — identity is a trust weight for Guardian
// scoring (Phase 7), not a gate.

import { computeLevel, vendorExpiry, type IdentityFactors } from "./levels";

export interface IdentityStatusRow {
  user_id: string;
  level: number;
  email_verified: boolean;
  phone_verified: boolean;
  device_attested: boolean;
  geo_consistent: boolean;
  vendor_ref: string | null;
  vendor_passed: boolean | null;
  vendor_level: 3 | 4 | null;
  verified_at: string | null;
  expires_at: string | null;
}

function toFactors(r: Partial<IdentityStatusRow>): IdentityFactors {
  return {
    emailVerified: r.email_verified === true,
    phoneVerified: r.phone_verified === true,
    deviceAttested: r.device_attested === true,
    geoConsistent: r.geo_consistent === true,
    vendorPassed: r.vendor_passed ?? null,
    vendorLevel: (r.vendor_level as 3 | 4 | null) ?? null,
    vendorExpiresAt: r.expires_at ?? null,
  };
}

// Upsert factor changes and recompute the level atomically-enough for this
// phase (one writer: server routes). Records a level_up/level_down event.
export async function updateIdentityFactors(
  userId: string,
  changes: Partial<Pick<IdentityStatusRow, "email_verified" | "phone_verified" | "device_attested" | "geo_consistent">>,
): Promise<{ level: number; previous: number }> {
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);

  const { data: existing } = await db.from("identity_status").select("*").eq("user_id", userId).maybeSingle();
  const merged = { ...(existing || {}), ...changes } as Partial<IdentityStatusRow>;
  const previous = existing?.level ?? 0;
  const level = computeLevel(toFactors(merged));

  const { error } = await db.from("identity_status").upsert({
    user_id: userId,
    ...changes,
    level,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);

  if (level !== previous) {
    await db.from("identity_events").insert({
      user_id: userId,
      kind: level > previous ? "level_up" : "level_down",
      detail: { from: previous, to: level },
    });
  }
  return { level, previous };
}

// Record an L3/L4 vendor result — ONLY the reference id + pass/fail + expiry
// (Rule 4: never the document, never biometrics). Not callable until an IDV
// vendor is chosen by Billy; kept here so the shape is settled.
export async function recordVendorResult(
  userId: string,
  result: { vendorRef: string; passed: boolean; level: 3 | 4; over18: boolean },
): Promise<{ level: number }> {
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);
  const now = Date.now();

  const { data: existing } = await db.from("identity_status").select("*").eq("user_id", userId).maybeSingle();
  const merged: Partial<IdentityStatusRow> = {
    ...(existing || {}),
    vendor_ref: result.vendorRef,
    vendor_passed: result.passed,
    vendor_level: result.level,
    expires_at: vendorExpiry(now),
  };
  const level = computeLevel(toFactors(merged), now);

  const { error } = await db.from("identity_status").upsert({
    user_id: userId,
    vendor_ref: result.vendorRef,
    vendor_passed: result.passed,
    vendor_level: result.level,
    over_18: result.over18,
    verified_at: new Date(now).toISOString(),
    expires_at: vendorExpiry(now),
    level,
    updated_at: new Date(now).toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  await db.from("identity_events").insert({ user_id: userId, kind: "vendor_result", detail: { passed: result.passed, level: result.level } });
  return { level };
}

// Velocity gate for NON-safety actions (e.g. future corroboration spam).
// Fail-OPEN on infra error: an anti-abuse outage must never block a user.
export async function checkVelocity(userId: string, action: string, windowSecs: number, max: number): Promise<{ allowed: boolean; count: number }> {
  try {
    const { serverDb } = await import("@/lib/payments/serverdb");
    const db = serverDb(true);
    const { data, error } = await db.rpc("bump_velocity", { p_user: userId, p_action: action, p_window_secs: windowSecs, p_max: max });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { allowed: row?.allowed !== false, count: row?.current_count ?? 0 };
  } catch (e) {
    console.error("[identity] velocity check failed, fail-open:", (e as Error).message);
    return { allowed: true, count: 0 };
  }
}
