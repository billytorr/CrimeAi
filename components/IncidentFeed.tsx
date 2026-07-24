"use client";

import type { Incident } from "@/lib/types";
import { timeAgo } from "@/lib/data";
import { catColor } from "@/lib/categories";

export default function IncidentFeed({ incidents, onSelect }: { incidents: Incident[]; onSelect?: (i: Incident) => void }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-card/70">
      <div className="flex items-center justify-between border-b border-ink/5 px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink2">Live feed</h2>
        <span className="text-xs text-ink3">{incidents.length} nearby</span>
      </div>
      <div className="max-h-[360px] divide-y divide-ink/5 overflow-y-auto">
        {incidents.map((i) => (
          <button
            key={i.incident_id}
            onClick={() => onSelect?.(i)}
            className="flex w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-ink/5"
          >
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: catColor(i.category) }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-ink">{i.type}</span>
                <span className="shrink-0 rounded bg-ink/5 px-1.5 text-[10px] text-ink2">sev {i.severity}</span>
                {!i.verified && (
                  <span className="shrink-0 rounded bg-ink3/20 px-1.5 text-[10px] text-ink2">unverified</span>
                )}
              </div>
              <div className="truncate text-xs text-ink2">
                {i.block}, {i.neighborhood}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink3">
                <span>{timeAgo(i.occurred_at)}</span>
                <span>·</span>
                <span>{i.source_label}</span>
                {i.corroborating_sources.length > 0 && (
                  <span className="text-brand">· +{i.corroborating_sources.length} corroborating</span>
                )}
              </div>
            </div>
          </button>
        ))}
        {!incidents.length && <p className="px-5 py-8 text-center text-sm text-ink3">No incidents match your filters.</p>}
      </div>
    </div>
  );
}
