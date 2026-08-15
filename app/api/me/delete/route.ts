import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { resolveUserId } from "@/lib/entitlements/request";

// POST /api/me/delete — in-app account deletion (Apple 5.1.1(v)), hardened.
//
// Order matters: the Authorize.Net ARB subscription is cancelled BEFORE the
// account rows are deleted. Deleting first would wipe the row that holds the
// ARB id and leave the card charging forever — a legal/chargeback problem,
// not just a compliance one. If ARB cancellation genuinely fails, we ABORT
// and tell the user, rather than orphan a recurring charge.
//
// After a successful cancel (or none needed), the auth user is deleted via
// the admin API; every FK is ON DELETE CASCADE, so profile, posts, reports,
// comments, likes, follows, messages, saved locations, alert subscriptions
// and scoring records all go with it. A single audit row records the event
// with the user id hashed (SHA-256) — enough for dispute forensics without
// retaining the identity we just erased.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ARB cancel errors that mean "there is nothing left to cancel" — the goal
// state, so deletion proceeds. Anything else is a real failure.
const ALREADY_DONE = /already|E00105|terminated|canceled|cancelled|expired/i;

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Sign in." }, { status: 401 });

  try {
    const { serverDb } = await import("@/lib/payments/serverdb");
    const db = serverDb(true);

    // 1) live subscription? cancel at Authorize.Net FIRST.
    const { data: sub } = await db
      .from("tier_subscriptions")
      .select("anet_subscription_id, status")
      .eq("user_id", userId)
      .maybeSingle();
    const hadActive = !!sub?.anet_subscription_id && ["active", "grace", "past_due"].includes(sub.status || "");
    let arbCancelled = false;
    if (sub?.anet_subscription_id) {
      try {
        const { cancelSubscription } = await import("@/lib/authnet/arb");
        await cancelSubscription(sub.anet_subscription_id);
        arbCancelled = true;
      } catch (e) {
        if (!ALREADY_DONE.test((e as Error).message || "")) {
          return NextResponse.json(
            { error: "We couldn't cancel your Protector subscription, so the account was NOT deleted. Please try again, or email support@publicsafetycrimecenter.com." },
            { status: 502 },
          );
        }
        // already cancelled/terminated at Authorize.Net — that's the goal state
      }
    }

    // 2) audit BEFORE the identity disappears (hashed — never the raw id)
    const userHash = createHash("sha256").update(userId).digest("hex");
    await db.from("account_deletions").insert({
      user_hash: userHash,
      had_active_subscription: hadActive,
      arb_cancelled: arbCancelled,
    }).then(() => {}, () => {}); // audit table missing must never block deletion

    // 3) delete the auth user — FK cascades erase all app data
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deleted: true, subscriptionCancelled: arbCancelled || hadActive });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
