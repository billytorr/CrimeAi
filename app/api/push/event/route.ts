import { NextRequest, NextResponse } from "next/server";
import {
  planComment, planLike, planMessage, planFollow, planCorroboration,
  planNearbyReport, planNews, planAnnouncement, CRITICAL_SEVERITY,
  type NotificationPlan,
} from "@/lib/push/events";
import { catSeverity } from "@/lib/categories";

// POST /api/push/event — called by Postgres (pg_net) the instant a row lands.
// Verified by a shared secret header. Resolves recipients, honours per-type
// preferences, and fans out. Always returns 200 so a notification failure
// never causes the database to retry against the user's write.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (req.headers.get("x-push-secret") !== process.env.PUSH_EVENT_SECRET || !process.env.PUSH_EVENT_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { type, record } = await req.json();
    const { serverDb } = await import("@/lib/payments/serverdb");
    const db = serverDb(true);
    const plan = await buildPlan(db, type, record);
    if (!plan || !plan.recipients.length) return NextResponse.json({ ok: true, skipped: true });

    const { sendPush } = await import("@/lib/push/send");
    let sent = 0;
    for (const userId of plan.recipients.slice(0, 500)) {
      if (!(await wantsType(db, userId, plan.prefKey, plan.kind))) continue;
      const r = await sendPush(userId, {
        title: plan.title, body: plan.body, kind: plan.kind,
        data: plan.data, dedupeKey: `${plan.dedupeKey}:${userId}`,
      });
      sent += r.sent;
    }
    return NextResponse.json({ ok: true, type, recipients: plan.recipients.length, sent });
  } catch (e) {
    console.error("[push/event]", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
}

// Per-type preference. Safety-kind notifications bypass it (an emergency
// reaches the device regardless) — this is NOT a tier/score/identity check.
async function wantsType(db: any, userId: string, prefKey: string, kind: string): Promise<boolean> {
  if (kind === "safety") return true;
  const { data } = await db.from("profiles").select("push_types").eq("id", userId).maybeSingle();
  const types = (data?.push_types || {}) as Record<string, boolean>;
  return types[prefKey] !== false;
}

async function userIdForHandle(db: any, handle: string): Promise<string | null> {
  if (!handle) return null;
  const { data } = await db.from("profiles").select("id").eq("handle", handle).maybeSingle();
  return data?.id ?? null;
}

async function nameOf(db: any, userId: string): Promise<string> {
  const { data } = await db.from("profiles").select("name, handle").eq("id", userId).maybeSingle();
  return data?.name || data?.handle || "Someone";
}

async function postOwner(db: any, postId: string): Promise<{ userId: string | null }> {
  const { data } = await db.from("posts").select("user_id").eq("id", postId).maybeSingle();
  return { userId: data?.user_id ?? null };
}

async function buildPlan(db: any, type: string, rec: any): Promise<NotificationPlan | null> {
  switch (type) {
    case "comment": {
      const { userId } = await postOwner(db, rec.post_id);
      return planComment(rec, userId || "");
    }
    case "like": {
      const { userId } = await postOwner(db, rec.post_id);
      if (!userId) return null;
      const { count } = await db.from("likes").select("post_id", { count: "exact", head: true }).eq("post_id", rec.post_id);
      return planLike(rec, userId, await nameOf(db, rec.user_id), count ?? 1);
    }
    case "message":
      return planMessage(rec, await nameOf(db, rec.sender_id));
    case "follow": {
      const target = await userIdForHandle(db, rec.target_handle);
      return planFollow(rec, target || "", await nameOf(db, rec.follower_id));
    }
    case "corroboration": {
      const { userId } = await postOwner(db, rec.report_id);
      return planCorroboration(rec, userId || "", await nameOf(db, rec.user_id));
    }
    case "post": {
      if (rec.kind === "report") {
        const severity = catSeverity(rec.category);
        const recipients = await neighboursFor(db, rec, severity);
        return planNearbyReport(rec, severity, recipients);
      }
      if (rec.kind === "news" || rec.source === "news") {
        const { data } = await db.from("profiles").select("id").limit(2000);
        return planNews(rec, (data || []).map((p: any) => p.id));
      }
      return null;                              // ordinary posts don't notify
    }
    case "announcement": {
      const { data } = await db.from("profiles").select("id").limit(2000);
      return planAnnouncement(rec, (data || []).map((p: any) => p.id));
    }
    default:
      return null;
  }
}

// Neighbours within their own alert radius who care about this category and
// severity. Uses each user's stored preferences — never a tier or score.
async function neighboursFor(db: any, rec: any, severity: number): Promise<string[]> {
  if (typeof rec.lat !== "number" || typeof rec.lon !== "number") return [];
  const MAX_MI = 10;                            // outer bound for the query
  const dLat = MAX_MI / 69, dLon = MAX_MI / (69 * Math.cos((rec.lat * Math.PI) / 180));
  const { data } = await db.from("profiles")
    .select("id, lat, lon, radius_miles, alert_categories, severity_min")
    .gte("lat", rec.lat - dLat).lte("lat", rec.lat + dLat)
    .gte("lon", rec.lon - dLon).lte("lon", rec.lon + dLon)
    .limit(2000);

  const out: string[] = [];
  for (const p of data || []) {
    if (p.id === rec.user_id) continue;
    if (severity < (p.severity_min ?? 1)) continue;
    const cats: string[] = p.alert_categories || [];
    if (cats.length && rec.category && !cats.includes(rec.category)) continue;
    const radius = Math.min(p.radius_miles ?? 1, MAX_MI);
    if (milesBetween(rec.lat, rec.lon, p.lat, p.lon) <= radius) out.push(p.id);
  }
  return out;
}

function milesBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180, dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
