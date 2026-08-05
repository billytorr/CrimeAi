// Guardian service — ledger ingestion, vesting settlement, score recompute,
// and the Phase 8 Protector flip. Composes the PURE guardian.ts engine with
// the DB. Never imports nss.ts (CI-enforced) — reputation and place-safety
// stay structurally separate. Payment state is WRITTEN by the flip (granting
// comped months) but never READ into any score.

import {
  reportValue, corroborationValue, computeGuardianScore, tierOf,
  penaltyValue, penaltyDecayFactor, flipGrantMonths, stackedPeriodEnd,
} from "./guardian";
import { loadGuardianConfig } from "./guardian-config";

async function db() {
  const { serverDb } = await import("@/lib/payments/serverdb");
  return serverDb(true);
}

const DAY_MS = 86_400_000;

// ── ingestion ───────────────────────────────────────────────────────

// Record a pending earning for a submitted report. NEVER blocks the report
// itself (Rule 3) — the post exists regardless; this only queues potential
// points that vest when the verification window closes.
export async function recordReportEvent(userId: string, reportId: string, cls: string, duplicateIndex = 0): Promise<void> {
  const cfg = await loadGuardianConfig();
  const d = await db();
  // daily cap: events beyond the cap are simply not queued (diminishing
  // returns handled inside valuation via duplicateIndex)
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count } = await d.from("guardian_events").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("kind", "report").gte("created_at", since);
  if ((count ?? 0) >= cfg.dailyCaps.reportEvents) return;

  const gs = reportValue(cls, 0, duplicateIndex, cfg);
  await d.from("report_verifications").upsert({ report_id: reportId }, { onConflict: "report_id", ignoreDuplicates: true });
  await d.from("guardian_events").insert({
    user_id: userId, kind: "report", gs_value: gs,
    watch_points: Math.max(0, Math.round(gs * cfg.watchPointsPerGs)),
    status: "pending",
    vests_at: new Date(Date.now() + cfg.vestingWindowHours * 3_600_000).toISOString(),
    ref_report_id: reportId, detail: { class: cls, duplicateIndex },
  });
}

// A user corroborates a report: velocity-limited, never their own report.
// Advances the verification pipeline (2+ independent corroborations →
// 'corroborated') and queues the corroborator's pending earning.
export async function recordCorroboration(userId: string, reportId: string): Promise<{ ok: boolean; reason?: string }> {
  const cfg = await loadGuardianConfig();
  const d = await db();

  const { data: post } = await d.from("posts").select("user_id, category, kind").eq("id", reportId).maybeSingle();
  if (!post || post.kind !== "report") return { ok: false, reason: "not a report" };
  if (post.user_id === userId) return { ok: false, reason: "cannot corroborate your own report" };

  const { checkVelocity } = await import("@/lib/identity/service");
  const vel = await checkVelocity(userId, "corroborate", 86_400, cfg.dailyCaps.corroborationEvents);
  if (!vel.allowed) return { ok: false, reason: "daily corroboration limit reached" };

  const { error: insErr } = await d.from("corroborations").insert({ report_id: reportId, user_id: userId });
  if (insErr) return { ok: false, reason: "already corroborated" };

  const { count } = await d.from("corroborations").select("id", { count: "exact", head: true }).eq("report_id", reportId);
  const corroborators = count ?? 0;
  await d.from("report_verifications").upsert({
    report_id: reportId, corroborators,
    status: corroborators >= 2 ? "corroborated" : "unverified",
    updated_at: new Date().toISOString(),
  }, { onConflict: "report_id" });

  // map the report's app category to a scoring class via NSS's category map
  // is deliberately NOT done here (module boundary); guardian valuation uses
  // its own base table keyed by class — the app category maps 1:1 for the
  // classes we pay on, defaulting tiny.
  const cls = CATEGORY_TO_CLASS[post.category] ?? "quality_of_life";
  const gs = corroborationValue(cls, cfg);
  await d.from("guardian_events").insert({
    user_id: userId, kind: "corroboration", gs_value: gs,
    watch_points: Math.max(0, Math.round(gs * cfg.watchPointsPerGs)),
    status: "pending",
    vests_at: new Date(Date.now() + cfg.vestingWindowHours * 3_600_000).toISOString(),
    ref_report_id: reportId, detail: { class: cls },
  });
  return { ok: true };
}

// App report categories → guardian scoring classes (guardian's own map;
// config-adjustable later if categories diverge).
const CATEGORY_TO_CLASS: Record<string, string> = {
  violent: "violent_armed", sexual: "sexual_offense", domestic: "violent_unarmed",
  burglary: "burglary_residential", vehicle: "theft_from_vehicle",
  identity: "larceny_other", cyber: "quality_of_life", other: "disorder",
};

// Moderation outcome: a report was rejected as false → penalty (settles
// immediately; penalties do not vest).
export async function recordFalseReportPenalty(userId: string, reportId: string, cls: string): Promise<void> {
  const cfg = await loadGuardianConfig();
  const d = await db();
  await d.from("report_verifications").upsert({ report_id: reportId, status: "rejected", resolved_at: new Date().toISOString() }, { onConflict: "report_id" });
  await d.from("guardian_events").insert({
    user_id: userId, kind: "penalty_false_report",
    gs_value: -penaltyValue("false_report", cls, cfg), watch_points: 0,
    status: "settled", settled_at: new Date().toISOString(),
    ref_report_id: reportId, detail: { class: cls },
  });
}

// Pull-model ingestion (serverless-friendly): report posts are written by the
// client straight to Supabase (Rule 3: no server gate on reporting), so the
// cron sweeps recent reports and queues pending earnings for any without an
// event yet. Novelty grouping (duplicate incidents) lands with incident
// clustering later — duplicateIndex 0 for now, honestly noted.
export async function queueNewReportEvents(now = Date.now()): Promise<number> {
  const cfg = await loadGuardianConfig();
  const d = await db();
  const since = new Date(now - 7 * DAY_MS).toISOString();
  const { data: reports } = await d.from("posts")
    .select("id, user_id, category, created_at")
    .eq("kind", "report").gte("created_at", since)
    .order("created_at", { ascending: false }).limit(500);
  if (!reports?.length) return 0;

  const ids = reports.map((r: any) => r.id);
  const { data: existing } = await d.from("guardian_events")
    .select("ref_report_id").eq("kind", "report").in("ref_report_id", ids);
  const seen = new Set((existing || []).map((e: any) => e.ref_report_id));

  let queued = 0;
  for (const r of reports) {
    if (seen.has(r.id) || !r.user_id) continue;
    const cls = CATEGORY_TO_CLASS[r.category] ?? "quality_of_life";
    await recordReportEvent(r.user_id, r.id, cls, 0);
    queued++;
  }
  return queued;
}

// ── vesting settlement + recompute (cron) ───────────────────────────

export async function settleAndRecompute(now = Date.now()): Promise<{ settled: number; rejected: number; recomputed: number; flips: number }> {
  const cfg = await loadGuardianConfig();
  const d = await db();
  let settled = 0, rejected = 0, flips = 0;

  const { data: due } = await d.from("guardian_events")
    .select("id, user_id, kind, ref_report_id")
    .eq("status", "pending").lte("vests_at", new Date(now).toISOString()).limit(500);

  const touched = new Set<string>();
  for (const ev of due || []) {
    let outcome: "settled" | "rejected" = "settled";
    if ((ev.kind === "report" || ev.kind === "corroboration") && ev.ref_report_id) {
      const { data: rv } = await d.from("report_verifications").select("status").eq("report_id", ev.ref_report_id).maybeSingle();
      // earnings vest ONLY on verification (corroborated / officially matched)
      outcome = rv?.status === "corroborated" || rv?.status === "official_match" ? "settled" : "rejected";
    }
    await d.from("guardian_events").update({ status: outcome, settled_at: new Date(now).toISOString() }).eq("id", ev.id);
    outcome === "settled" ? settled++ : rejected++;
    touched.add(ev.user_id);
  }

  let recomputed = 0;
  for (const userId of touched) {
    const res = await recomputeGuardian(userId, now);
    recomputed++;
    if (res.granted > 0) flips++;
  }
  return { settled, rejected, recomputed, flips };
}

export async function recomputeGuardian(userId: string, now = Date.now()): Promise<{ score: number; tier: string; granted: number }> {
  const cfg = await loadGuardianConfig();
  const d = await db();

  const { data: events } = await d.from("guardian_events")
    .select("kind, gs_value, watch_points, status, created_at").eq("user_id", userId).limit(5000);
  const rows = events || [];

  let contribution = 0, agedPenalties = 0, gsPending = 0, watchPending = 0, watchSettled = 0;
  let verified = 0, rejectedCount = 0;
  let lastActive = 0;
  for (const e of rows) {
    lastActive = Math.max(lastActive, +new Date(e.created_at));
    if (e.kind.startsWith("penalty_")) {
      const days = (now - +new Date(e.created_at)) / DAY_MS;
      agedPenalties += Math.abs(e.gs_value) * penaltyDecayFactor(days, cfg);
      continue;
    }
    if (e.status === "settled") {
      contribution += Number(e.gs_value);
      watchSettled += e.watch_points;
      if (e.kind === "report") verified++;
    } else if (e.status === "pending") {
      gsPending += Number(e.gs_value);
      watchPending += e.watch_points;
    } else if (e.status === "rejected" && e.kind === "report") {
      rejectedCount++;
    }
  }

  const { data: idRow } = await d.from("identity_status").select("level").eq("user_id", userId).maybeSingle();
  const identityLevel = idRow?.level ?? 0;
  const daysInactive = lastActive ? (now - lastActive) / DAY_MS : 0;

  const result = computeGuardianScore(
    { contributionValue: contribution, agedPenalties, verified, rejected: rejectedCount, identityLevel, daysInactive }, cfg);

  const { data: prev } = await d.from("guardian_scores").select("tier").eq("user_id", userId).maybeSingle();
  const previousTier = prev?.tier ?? "neighbor";
  const tier = tierOf(result.score, identityLevel, cfg); // captain needs manual approval — not granted here

  await d.from("guardian_scores").upsert({
    user_id: userId, score: result.score, tier,
    verified_count: verified, rejected_count: rejectedCount,
    gs_pending: gsPending, gs_settled: contribution,
    watch_pending: watchPending, watch_settled: watchSettled,
    last_active_at: lastActive ? new Date(lastActive).toISOString() : null,
    explanation: result.explanation, computed_at: new Date(now).toISOString(),
  }, { onConflict: "user_id" });

  // ── Phase 8: the Protector flip — reputation earns the paid tier ──
  let granted = 0;
  const months = flipGrantMonths(previousTier, tier, cfg);
  if (months > 0) {
    const { data: sub } = await d.from("tier_subscriptions").select("current_period_end, status, price_id").eq("user_id", userId).maybeSingle();
    const activeEnd = sub && ["active", "grace", "past_due"].includes(sub.status) ? sub.current_period_end : null;
    const newEnd = stackedPeriodEnd(activeEnd, months, now);
    await d.from("tier_subscriptions").upsert({
      user_id: userId, plan_id: "pro",
      price_id: sub?.price_id ?? null,        // comped when null
      status: "active",
      current_period_start: sub?.current_period_end ?? new Date(now).toISOString(),
      current_period_end: newEnd, grace_until: null,
      updated_at: new Date(now).toISOString(),
    }, { onConflict: "user_id" });          // badge projection trigger fires automatically
    await d.from("guardian_events").insert({
      user_id: userId, kind: "protector_grant", gs_value: 0, watch_points: 0,
      status: "settled", settled_at: new Date(now).toISOString(),
      detail: { months, fromTier: previousTier, toTier: tier, until: newEnd },
    });
    granted = months;
  }
  return { score: result.score, tier, granted };
}
