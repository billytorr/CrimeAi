"use client";

// Scores — the scoring & integrity dashboard (gamification Phase 11).
// EXTENDS the Command Center; nothing existing was rebuilt. Reads the live
// scoring tables: area_scores (NSS), block_strength, guardian_scores,
// guardian_events (points ledger), identity_status, corroborations.
//
// No raw PII in aggregate views: cohorts and counts only. The one drill-down
// (top contributors) shows display name + tier, never contact details.
import { useEffect, useMemo, useState } from "react";
import { supabase, timeAgo } from "@/lib/admin";
import { Badge, Panel, StatCard, Td, Th } from "@/components/ui";

const TIER_ORDER = ["neighbor", "watcher", "guardian", "sentinel", "captain"];
const BLOCK_ORDER = ["dark", "forming", "watched", "protected", "fortified"];

export default function Scores() {
  const [areas, setAreas] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [identity, setIdentity] = useState<any[]>([]);
  const [rings, setRings] = useState<{ members: string[]; internalShare: number; totalCorroborations: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [a, b, g, e, i, corr] = await Promise.all([
        supabase.from("area_scores").select("area_key, score, score_low, score_high, confidence, hazard, companion, explanation, computed_at").eq("area_kind", "neighborhood").order("score", { ascending: true }),
        supabase.from("block_strength").select("*").order("score", { ascending: false }),
        supabase.from("guardian_scores").select("user_id, score, tier, verified_count, rejected_count, watch_pending, watch_settled, gs_pending, gs_settled"),
        supabase.from("guardian_events").select("kind, gs_value, watch_points, status, created_at, user_id").order("created_at", { ascending: false }).limit(2000),
        supabase.from("identity_status").select("level"),
        supabase.from("corroborations").select("user_id, report_id").limit(5000),
      ]);
      setAreas(a.data || []); setBlocks(b.data || []); setGuardians(g.data || []);
      setEvents(e.data || []); setIdentity(i.data || []);
      setRings(await detectRings(corr.data || []));
      setLoading(false);
    })();
  }, []);

  // ── NSS coverage & confidence ────────────────────────────────────
  const nssStats = useMemo(() => {
    const scored = areas.filter((a) => a.score != null);
    const ranged = areas.filter((a) => a.score == null);
    const avgConf = areas.length ? areas.reduce((s, a) => s + Number(a.confidence), 0) / areas.length : 0;
    return { total: areas.length, scored: scored.length, ranged: ranged.length, avgConf };
  }, [areas]);

  // ── points economy (outstanding liability = unredeemed settled points) ──
  const economy = useMemo(() => {
    let issued = 0, vested = 0, pending = 0, penalties = 0, grants = 0;
    for (const ev of events) {
      if (ev.kind === "protector_grant") { grants++; continue; }
      if (String(ev.kind).startsWith("penalty_")) { penalties++; continue; }
      issued += ev.watch_points || 0;
      if (ev.status === "settled") vested += ev.watch_points || 0;
      if (ev.status === "pending") pending += ev.watch_points || 0;
    }
    return { issued, vested, pending, penalties, grants, outstanding: vested }; // nothing redeemable yet
  }, [events]);

  // ── integrity: rejection rate, farming signals, cap proximity ─────
  const integrity = useMemo(() => {
    const reportEvents = events.filter((e) => e.kind === "report");
    const rejected = reportEvents.filter((e) => e.status === "rejected").length;
    const settled = reportEvents.filter((e) => e.status === "settled").length;
    const rejectionRate = settled + rejected ? rejected / (settled + rejected) : 0;

    // users whose reports are mostly rejected (false-report cohort)
    const badActors = guardians.filter((g) => g.rejected_count >= 3 && g.rejected_count > g.verified_count);

    // daily-cap proximity: users at/near the 10 report-events per day cap
    const dayAgo = Date.now() - 86_400_000;
    const perUserToday: Record<string, number> = {};
    for (const e of events) {
      if (e.kind !== "report" || +new Date(e.created_at) < dayAgo) continue;
      perUserToday[e.user_id] = (perUserToday[e.user_id] || 0) + 1;
    }
    const nearCap = Object.entries(perUserToday).filter(([, n]) => n >= 8).length;
    return { rejectionRate, badActors: badActors.length, nearCap, totalReportEvents: reportEvents.length };
  }, [events, guardians]);

  const tierCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of guardians) m[g.tier] = (m[g.tier] || 0) + 1;
    return m;
  }, [guardians]);

  const identityFunnel = useMemo(() => {
    const m: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const r of identity) m[r.level] = (m[r.level] || 0) + 1;
    return m;
  }, [identity]);

  if (loading) return <p className="py-16 text-center text-sm text-ink3">Loading scoring data…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Areas scored" value={`${nssStats.scored}/${nssStats.total}`} sub={`${nssStats.ranged} shown as range`} tone={nssStats.ranged > nssStats.scored ? "warn" : "ok"} />
        <StatCard label="Avg NSS confidence" value={nssStats.avgConf.toFixed(2)} sub="below 0.6 = range only" tone={nssStats.avgConf >= 0.6 ? "ok" : "warn"} />
        <StatCard label="Guardians scored" value={guardians.length} sub={`${tierCounts.captain || 0} captains`} />
        <StatCard label="Watch Points outstanding" value={economy.outstanding} sub={`${economy.pending} still vesting`} />
        <StatCard label="Report rings flagged" value={rings.length} tone={rings.length ? "bad" : "ok"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={`Neighborhood Safety Score — confidence coverage (${areas.length} areas)`}>
          <p className="mb-2 text-xs text-ink2">Lowest scores first. A range means we do not have enough data to publish a point value.</p>
          <div className="max-h-[46vh] overflow-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><Th>Area</Th><Th>Score</Th><Th>Confidence</Th><Th>Population</Th><Th>Top class</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {areas.map((a) => {
                  const top = Object.entries(a.explanation?.byClass || {}).sort((x: any, y: any) => y[1] - x[1])[0];
                  const pop = a.companion?.population?.value;
                  return (
                    <tr key={a.area_key}>
                      <Td className="font-medium">{a.area_key}</Td>
                      <Td>{a.score != null ? <span className="font-semibold">{Math.round(a.score)}</span> : <Badge tone="warn">{a.score_low}–{a.score_high}</Badge>}</Td>
                      <Td><span className={Number(a.confidence) >= 0.6 ? "text-ok" : "text-warn"}>{Number(a.confidence).toFixed(2)}</span></Td>
                      <Td className="text-ink3">{pop ? pop.toLocaleString() : "—"}</Td>
                      <Td className="text-ink2">{top ? String(top[0]).replace(/_/g, " ") : "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={`Block Strength — coverage & live-ZIP readiness (${blocks.length})`}>
          <p className="mb-2 text-xs text-ink2">How well-watched each area is. Crime rate is not an input. &quot;Protected&quot; (60+) is the live-ZIP threshold.</p>
          {!blocks.length ? <p className="py-8 text-center text-sm text-ink3">Not computed yet — runs with the daily scoring job.</p> : (
            <div className="max-h-[46vh] overflow-auto">
              <table className="w-full">
                <thead><tr className="border-b border-line"><Th>Area</Th><Th>Strength</Th><Th>Tier</Th><Th>To next tier</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {blocks.map((b) => (
                    <tr key={b.area_key}>
                      <Td className="font-medium">{b.area_key}</Td>
                      <Td className="font-semibold">{Number(b.score).toFixed(1)}</Td>
                      <Td><Badge tone={BLOCK_ORDER.indexOf(b.tier) >= 3 ? "ok" : BLOCK_ORDER.indexOf(b.tier) >= 1 ? "warn" : "muted"}>{b.tier}</Badge></Td>
                      <Td className="text-ink3">{b.neighbors_needed != null ? `+${b.neighbors_needed} neighbors → ${b.next_tier}` : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Guardian tiers">
          <div className="space-y-2 text-sm">
            {TIER_ORDER.map((t) => (
              <div key={t} className="flex items-center justify-between">
                <span className="capitalize text-ink2">{t}</span>
                <span className="font-semibold">{tierCounts[t] || 0}</span>
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-relaxed text-ink3">Tiers require score AND identity level. Captain is manual-approval only and can never be purchased.</p>
          </div>
        </Panel>

        <Panel title="Points economy">
          <div className="space-y-2 text-sm">
            <Line label="Issued (all time)" value={economy.issued} />
            <Line label="Vested (settled)" value={economy.vested} />
            <Line label="Pending (not yet vested)" value={economy.pending} tone={economy.pending > 0 ? "warn" : undefined} />
            <Line label="Outstanding liability" value={economy.outstanding} />
            <Line label="Free Protector months granted" value={economy.grants} />
            <p className="pt-1 text-[11px] leading-relaxed text-ink3">Watch Points are non-transferable and non-cashable (enforced in the schema). No redemption catalog exists yet, so outstanding = vested.</p>
          </div>
        </Panel>

        <Panel title="Identity verification funnel">
          <div className="space-y-2 text-sm">
            {[0, 1, 2, 3, 4].map((l) => (
              <div key={l} className="flex items-center justify-between">
                <span className="text-ink2">L{l}{l === 0 ? " (account only)" : l === 1 ? " (email+phone)" : l === 2 ? " (+device/geo)" : l === 3 ? " (+gov ID)" : " (+liveness)"}</span>
                <span className="font-semibold">{identityFunnel[l] || 0}</span>
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-relaxed text-ink3">L1 needs a phone provider and L3/L4 need an IDV vendor — both pending, so users sit at L0 today.</p>
          </div>
        </Panel>
      </div>

      <Panel title="Integrity">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Report rejection rate" value={`${Math.round(integrity.rejectionRate * 100)}%`} sub={`${integrity.totalReportEvents} report events`} tone={integrity.rejectionRate > 0.3 ? "bad" : "ok"} />
          <StatCard label="False-report cohort" value={integrity.badActors} sub="3+ rejected, mostly wrong" tone={integrity.badActors ? "warn" : "ok"} />
          <StatCard label="Near daily cap" value={integrity.nearCap} sub="8+ reports today" tone={integrity.nearCap ? "warn" : "ok"} />
          <StatCard label="Report rings" value={rings.length} sub="mutual-corroboration clusters" tone={rings.length ? "bad" : "ok"} />
        </div>
        {rings.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink3">Flagged clusters</div>
            <table className="w-full">
              <thead><tr className="border-b border-line"><Th>Members</Th><Th>Internal share</Th><Th>Corroborations</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {rings.map((r, i) => (
                  <tr key={i}>
                    <Td className="font-mono text-xs">{r.members.map((m) => m.slice(0, 8)).join(", ")}</Td>
                    <Td><Badge tone="bad">{Math.round(r.internalShare * 100)}%</Badge></Td>
                    <Td>{r.totalCorroborations}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-ink2">
          Anti-manipulation caps are enforced inside the score itself: user-generated content can never exceed 30% of an area&apos;s
          signal, and one person can never exceed 5% of that. A brigade cannot move a neighborhood&apos;s score.
        </p>
      </Panel>

      <Panel title="Top contributors">
        {!guardians.length ? <p className="py-8 text-center text-sm text-ink3">No Guardian Scores yet — they appear as reports are corroborated.</p> : (
          <div className="max-h-[36vh] overflow-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><Th>User</Th><Th>Score</Th><Th>Tier</Th><Th>Verified</Th><Th>Rejected</Th><Th>Points</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {[...guardians].sort((a, b) => b.score - a.score).slice(0, 20).map((g) => (
                  <tr key={g.user_id}>
                    <Td className="font-mono text-xs text-ink3">{g.user_id.slice(0, 8)}</Td>
                    <Td className="font-semibold">{Math.round(g.score)}</Td>
                    <Td><Badge tone={g.tier === "captain" ? "ok" : "muted"}>{g.tier}</Badge></Td>
                    <Td className="text-ok">{g.verified_count}</Td>
                    <Td className={g.rejected_count ? "text-brand" : "text-ink3"}>{g.rejected_count}</Td>
                    <Td className="text-ink2">{g.watch_settled}{g.watch_pending ? ` (+${g.watch_pending} pending)` : ""}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Methodology">
        <p className="text-xs leading-relaxed text-ink2">
          The published Safety Score methodology is generated from the live configuration, so it can never drift from what the
          system actually computes. Weights, half-lives, caps and thresholds are edited in <span className="text-ink">scoring_config</span> and take effect without a deploy.
        </p>
        <a href="https://app.publicsafetycrimecenter.com/api/scoring/methodology" target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-brand">
          View published methodology →
        </a>
        {areas[0]?.computed_at && <p className="mt-2 text-[11px] text-ink3">Scores last recomputed {timeAgo(areas[0].computed_at)}.</p>}
      </Panel>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink2">{label}</span>
      <span className={`font-semibold ${tone === "warn" ? "text-warn" : ""}`}>{value.toLocaleString()}</span>
    </div>
  );
}

// Ring detection — same algorithm as the app's lib/identity/antiabuse.ts
// (the Command Center is a separate Next app, so it cannot import from it).
// Accounts that co-corroborate each other and almost nobody else are a
// collusion cluster. Read-only signal for a human to review; nothing is
// auto-actioned.
const RING_MIN_MEMBERS = 3, RING_MIN_TOTAL = 6, RING_INTERNAL_SHARE = 0.8;

async function detectRings(corr: { user_id: string; report_id: string }[]) {
  const byReport = new Map<string, string[]>();
  for (const c of corr) {
    if (!byReport.has(c.report_id)) byReport.set(c.report_id, []);
    byReport.get(c.report_id)!.push(c.user_id);
  }
  // co-corroboration edges (both directions, so every pair is mutual)
  const edges: { from: string; to: string; count: number }[] = [];
  const acc: Record<string, number> = {};
  for (const users of Array.from(byReport.values())) {
    for (const a of users) for (const b of users) if (a !== b) acc[`${a}>${b}`] = (acc[`${a}>${b}`] || 0) + 1;
  }
  for (const [k, count] of Object.entries(acc)) { const [from, to] = k.split(">"); edges.push({ from, to, count }); }

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p === x) return x;
    const r = find(p); parent.set(x, r); return r;
  };
  const pairs = new Set(edges.map((e) => `${e.from}>${e.to}`));
  for (const e of edges) {
    if (!pairs.has(`${e.to}>${e.from}`)) continue;
    const ra = find(e.from), rb = find(e.to);
    if (ra !== rb) parent.set(ra, rb);
  }

  const clusters = new Map<string, Set<string>>();
  for (const u of Array.from(parent.keys())) {
    const r = find(u);
    if (!clusters.has(r)) clusters.set(r, new Set());
    clusters.get(r)!.add(u);
  }

  const flags: { members: string[]; internalShare: number; totalCorroborations: number }[] = [];
  for (const members of Array.from(clusters.values())) {
    if (members.size < RING_MIN_MEMBERS) continue;
    let internal = 0, total = 0;
    for (const e of edges) {
      if (!members.has(e.from)) continue;
      total += e.count;
      if (members.has(e.to)) internal += e.count;
    }
    if (total >= RING_MIN_TOTAL && internal / total >= RING_INTERNAL_SHARE) {
      flags.push({ members: Array.from(members).sort(), internalShare: internal / total, totalCorroborations: total });
    }
  }
  return flags.sort((a, b) => b.totalCorroborations - a.totalCorroborations);
}
