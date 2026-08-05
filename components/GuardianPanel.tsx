"use client";

// Phase 10 profile surfaces — Guardian Score, tier, vesting balances, and
// Block Strength with the recruitment gap. Rendered INSIDE the existing
// "My Score" tab (additive: the tab set My Score / My Reports / My
// Neighborhood is unchanged).
//
// Everything here is display-only; the server is the authority.
import { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "@/lib/api";

interface GuardianData {
  score: number; tier: string;
  accuracy: { verified: number; rejected: number };
  guardianPoints: { pending: number; settled: number };
  watchPoints: { pending: number; settled: number };
}
interface BlockData {
  score: number | null; tier: string | null;
  nextTier: string | null; neighborsNeeded: number | null;
  temporalGapHours: number[]; gaps: { component: string; hint: string }[];
}

const TIER_COPY: Record<string, string> = {
  neighbor: "Neighbor", watcher: "Watcher", guardian: "Guardian",
  sentinel: "Sentinel", captain: "Captain",
};
const BLOCK_COPY: Record<string, string> = {
  dark: "Dark", forming: "Forming", watched: "Watched",
  protected: "Protected", fortified: "Fortified",
};

export default function GuardianPanel({ lat, lon }: { lat: number; lon: number }) {
  const [g, setG] = useState<GuardianData | null>(null);
  const [b, setB] = useState<BlockData | null>(null);

  useEffect(() => {
    authHeaders().then((h) => {
      if (h.Authorization) {
        fetch(apiUrl("/api/me/guardian"), { headers: h })
          .then((r) => (r.ok ? r.json() : null)).then((d) => d && setG(d)).catch(() => {});
      }
    });
    fetch(apiUrl(`/api/blocks?lat=${lat}&lon=${lon}`))
      .then((r) => (r.ok ? r.json() : null)).then((d) => d && setB(d)).catch(() => {});
  }, [lat, lon]);

  if (!g && !b) return null;

  return (
    <div className="space-y-3">
      {g && (
        <div className="rounded-2xl border border-ink/10 bg-card/70 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink2">Guardian Score</span>
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand">{TIER_COPY[g.tier] || g.tier}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold">{Math.round(g.score)}</span>
            <span className="text-xs text-ink3">/ 1000</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Stat label="Watch Points" value={g.watchPoints.settled} sub={g.watchPoints.pending > 0 ? `${g.watchPoints.pending} pending` : "all settled"} />
            <Stat label="Verified reports" value={g.accuracy.verified} sub={g.accuracy.rejected > 0 ? `${g.accuracy.rejected} rejected` : "none rejected"} />
          </div>
          {g.guardianPoints.pending > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink3">
              Pending points settle once your reports are confirmed by neighbors or matched to an official record.
            </p>
          )}
        </div>
      )}

      {b && b.score != null && (
        <div className="rounded-2xl border border-ink/10 bg-card/70 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink2">Block Strength</span>
            <span className="rounded-full bg-ink/10 px-2.5 py-0.5 text-[11px] font-semibold text-ink2">{BLOCK_COPY[b.tier || ""] || b.tier}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold">{Math.round(b.score)}</span>
            <span className="text-xs text-ink3">/ 100 · how well-watched your block is</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, b.score)}%` }} />
          </div>
          {b.nextTier && b.neighborsNeeded != null && (
            <p className="mt-2.5 text-xs text-ink2">
              <span className="font-semibold text-ink">{b.neighborsNeeded} more {b.neighborsNeeded === 1 ? "neighbor" : "neighbors"}</span> reaches {BLOCK_COPY[b.nextTier] || b.nextTier}.
            </p>
          )}
          {b.temporalGapHours.length > 0 && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink3">
              Coverage gap: nobody is active around {formatHours(b.temporalGapHours)}.
            </p>
          )}
          {b.gaps?.[0] && <p className="mt-1.5 text-[11px] text-ink3">{b.gaps[0].hint}.</p>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-shell px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-ink3">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
      <div className="text-[10px] text-ink3">{sub}</div>
    </div>
  );
}

function formatHours(hours: number[]): string {
  const h12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
  const sorted = [...hours].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0], prev = sorted[0];
  for (const h of sorted.slice(1)) {
    if (h !== prev + 1) { runs.push(start === prev ? h12(start) : `${h12(start)}–${h12(prev + 1)}`); start = h; }
    prev = h;
  }
  runs.push(start === prev ? h12(start) : `${h12(start)}–${h12(prev + 1)}`);
  return runs.join(", ");
}
