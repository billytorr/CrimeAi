"use client";

import type { AreaStats } from "@/lib/types";

const CAT_COLOR: Record<string, string> = {
  violent: "#c0392b",
  property: "#d98a00",
  nuisance: "#3b82f6",
  hazard: "#a855f7",
  unverified: "#64748b",
};
const CAT_LABEL: Record<string, string> = {
  violent: "Violent",
  property: "Property",
  nuisance: "Nuisance",
  hazard: "Hazard",
  unverified: "Unverified",
};

export function CategoryBreakdown({ stats }: { stats: AreaStats }) {
  const entries = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return (
    <div className="rounded-2xl border border-ink/10 bg-card/70 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink2">What's happening</h2>
      <div className="space-y-2.5">
        {entries.map(([cat, n]) => (
          <div key={cat}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-ink2">{CAT_LABEL[cat] || cat}</span>
              <span className="text-ink2">{n}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-shell">
              <div
                className="h-full rounded-full"
                style={{ width: `${(n / max) * 100}%`, background: CAT_COLOR[cat] }}
              />
            </div>
          </div>
        ))}
        {!entries.length && <p className="text-sm text-ink3">No incidents in this window.</p>}
      </div>
      {stats.byType.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {stats.byType.slice(0, 6).map((t) => (
            <span key={t.type} className="rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs text-ink2">
              {t.type} · {t.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function TimeOfDay({ stats }: { stats: AreaStats }) {
  const max = Math.max(1, ...stats.hourHistogram);
  const peak = stats.hourHistogram.indexOf(max);
  const fmt = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`;
  return (
    <div className="rounded-2xl border border-ink/10 bg-card/70 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink2">Risk by time of day</h2>
        <span className="text-xs text-ink2">peak ~{fmt(peak)}</span>
      </div>
      <div className="flex h-20 items-end gap-[2px]">
        {stats.hourHistogram.map((c, h) => {
          const night = h >= 21 || h <= 4;
          return (
            <div
              key={h}
              title={`${fmt(h)}: ${c}`}
              className="flex-1 rounded-t-sm"
              style={{
                height: `${Math.max(4, (c / max) * 100)}%`,
                background: night ? "#c0392b" : "#3b82f6",
                opacity: c === 0 ? 0.25 : 0.9,
              }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink3">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>11p</span>
      </div>
      <p className="mt-2 text-xs text-ink2">
        Red bars are late-night hours (9pm–4am). {stats.nightSharePct}% of nearby incidents happen then.
      </p>
    </div>
  );
}
