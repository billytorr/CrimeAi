"use client";

import type { AreaStats } from "@/lib/types";

export default function SafetyScore({ stats, neighborhood }: { stats: AreaStats; neighborhood: string }) {
  const score = stats.safetyScore;
  const band = score >= 75 ? "Calm" : score >= 55 ? "Moderate" : score >= 40 ? "Elevated" : "High activity";
  const color = score >= 75 ? "#1b7f3a" : score >= 55 ? "#86b300" : score >= 40 ? "#d98a00" : "#c0392b";
  const circumference = 2 * Math.PI * 52;
  const dash = (score / 100) * circumference;

  return (
    <div className="rounded-2xl border border-ink/10 bg-card/70 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink2">Safety Score</h2>
        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${color}22`, color }}>
          {band}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-5">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgb(var(--c-ink) / 0.12)" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color }}>
                {score}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-ink3">of 100</div>
            </div>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <Row label="Incidents (30d)" value={String(stats.total)} />
          <Row
            label="vs city avg"
            value={`${stats.cityComparisonPct >= 0 ? "+" : ""}${stats.cityComparisonPct}%`}
            tone={stats.cityComparisonPct > 0 ? "bad" : "good"}
          />
          <Row
            label="7-day trend"
            value={`${stats.trendPct >= 0 ? "+" : ""}${stats.trendPct}%`}
            tone={stats.trendPct > 0 ? "bad" : "good"}
          />
          <Row label="Night share" value={`${stats.nightSharePct}%`} />
        </div>
      </div>
      <p className="mt-3 text-xs text-ink2">
        Around <span className="text-ink">{neighborhood}</span>. Higher score = fewer, lower-severity incidents
        per square mile vs the Miami baseline.
      </p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  // "good" stays green — safety semantics, not brand accent.
  const c = tone === "good" ? "text-green-500" : tone === "bad" ? "text-red-400" : "text-ink";
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-ink2">{label}</span>
      <span className={`font-semibold ${c}`}>{value}</span>
    </div>
  );
}
