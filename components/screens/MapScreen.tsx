"use client";

import { apiUrl } from "@/lib/api";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "@/lib/auth";
import type { Incident } from "@/lib/types";
import { milesBetween, timeAgo } from "@/lib/data";
import { reportsForMap, type Post } from "@/lib/social";
import { CATEGORIES, normalizeCat, catSeverity } from "@/lib/categories";
import { Search, Home, Plus, Pin, Flame } from "@/components/Icons";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

// map filter chips render straight from the shared taxonomy
const CATS = CATEGORIES.map((c) => ({ id: c.id, label: c.short, color: c.color }));

// Horizontal scroller that works on every input: touch swipe (pan-x),
// mouse drag (scrollbars are hidden app-wide), and mouse wheel. Suppresses
// the click that would otherwise fire on the chip you dragged from.
function DragScroll({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let down = false, moved = false, startX = 0, startLeft = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return; // touch uses native pan-x
      down = true; moved = false; startX = e.clientX; startLeft = el.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      el.scrollLeft = startLeft - dx;
    };
    const onUp = () => { down = false; };
    const onClick = (e: MouseEvent) => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    };
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // native horizontal wheel/trackpad
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("click", onClick, true);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);
  return (
    <div ref={ref} className={`${className} cursor-grab select-none overscroll-x-contain [touch-action:pan-x] active:cursor-grabbing`}>
      {children}
    </div>
  );
}

// Community reports use the shared taxonomy directly; normalizeCat maps
// legacy composer ids (theft/harassment/unknown…) onto it.
function reportToIncident(post: Post): Incident {
  const cat = normalizeCat(post.category) as Incident["category"];
  return {
    incident_id: post.id, source: "community", source_label: `Community · ${post.author}`, verified: false,
    category: cat, type: post.text.slice(0, 40) || "Community report",
    neighborhood: post.neighborhood, block: "Community report", lat: post.lat, lon: post.lon,
    occurred_at: post.createdAt, reported_at: post.createdAt,
    severity: catSeverity(post.category), confidence: 0.4, corroborating_sources: [],
  };
}

interface Center { lat: number; lon: number; neighborhood: string }

export default function MapScreen({ profile, refreshKey, onReport }: { profile: Profile; refreshKey: number; onReport: () => void }) {
  const home = profile.location;
  const [center, setCenter] = useState<Center>({ lat: home.lat, lon: home.lon, neighborhood: home.neighborhood });
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  const [apiIncidents, setApiIncidents] = useState<Incident[]>([]);
  const [communityReports, setCommunityReports] = useState<Post[]>([]);
  const [radius, setRadius] = useState(profile.alerts.radiusMiles || 1.5);
  const [days, setDays] = useState(30);
  const [active, setActive] = useState<string[]>([]);
  const [heat, setHeat] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const away = center.lat !== home.lat || center.lon !== home.lon;

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchErr("");
    try {
      const res = await fetch(apiUrl("/api/crimeai/lookup"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: q }) });
      const d = await res.json();
      if (!res.ok) setSearchErr(d.error || "Couldn't find that area.");
      else setCenter({ lat: d.location.lat, lon: d.location.lon, neighborhood: d.location.neighborhood });
    } catch {
      setSearchErr("Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }
  function resetHome() {
    setCenter({ lat: home.lat, lon: home.lon, neighborhood: home.neighborhood });
    setQuery(""); setSearchErr("");
  }

  useEffect(() => {
    const params = new URLSearchParams({ lat: String(center.lat), lon: String(center.lon), radius: String(radius), days: String(days) });
    if (active.length) params.set("categories", active.join(","));
    fetch(apiUrl(`/api/incidents?${params}`)).then((r) => r.json()).then((d) => d.incidents && setApiIncidents(d.incidents)).catch(() => {});
  }, [center.lat, center.lon, radius, days, active]);

  useEffect(() => {
    let cancel = false;
    reportsForMap().then((r) => { if (!cancel) setCommunityReports(r); });
    return () => { cancel = true; };
  }, [refreshKey]);

  const incidents = useMemo(() => {
    const cutoff = Date.now() - days * 86400000;
    const reports = communityReports
      .filter((p) => +new Date(p.createdAt) >= cutoff)
      .filter((p) => milesBetween(center.lat, center.lon, p.lat, p.lon) <= radius)
      .filter((p) => active.length === 0 || active.includes(normalizeCat(p.category)))
      .map(reportToIncident);
    return [...apiIncidents, ...reports];
  }, [apiIncidents, communityReports, center.lat, center.lon, radius, days, active]);

  const toggle = (id: string) => setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const sorted = useMemo(() => [...incidents].sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at)), [incidents]);

  return (
    <div className="relative h-full">
      <Map lat={center.lat} lon={center.lon} radiusMiles={radius} incidents={incidents} heat={heat} />

      {/* report FAB */}
      <button onClick={onReport} className="absolute bottom-[230px] right-4 z-[1050] grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-lg active:scale-95" aria-label="Report"><Plus size={24} /></button>
      {/* hotspot (heat) toggle — compact, tucked under the report FAB */}
      <button onClick={() => setHeat((h) => !h)} className={`absolute bottom-[176px] right-[22px] z-[1050] grid h-11 w-11 place-items-center rounded-full shadow-lg backdrop-blur transition active:scale-95 ${heat ? "bg-brand text-white" : "border border-ink/10 bg-shell/90 text-ink2"}`} aria-label="Toggle hotspot view"><Flame size={19} /></button>

      {/* top controls */}
      <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-[1000] space-y-2.5 px-4 pt-4">
        <h1 className="bg-gradient-to-r from-ink to-brand bg-clip-text text-xl font-extrabold tracking-tight text-transparent">Crime Map</h1>
        {/* search */}
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-ink/10 bg-shell/90 px-3 py-2.5 backdrop-blur">
          <span className="text-ink2"><Search size={18} /></span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search any address, neighborhood, city, or ZIP"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink3"
          />
          {searching ? <span className="text-xs text-ink2">…</span> : query ? <button onClick={runSearch} className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white">Go</button> : null}
        </div>
        {searchErr && <div className="pointer-events-auto rounded-xl bg-red-500/15 px-3 py-1.5 text-xs text-red-300">{searchErr}</div>}

        {/* viewing pill */}
        <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-xl border border-ink/10 bg-shell/85 px-3 py-1.5 backdrop-blur">
          <span className="flex items-center gap-1.5 truncate text-xs text-ink2"><Pin size={13} /> Viewing <span className="font-semibold text-ink">{center.neighborhood}</span></span>
          {away && <button onClick={resetHome} className="flex shrink-0 items-center gap-1 rounded-full bg-ink/10 px-2.5 py-1 text-xs font-medium text-brand"><Home size={13} /> Home</button>}
        </div>

        {/* category chips */}
        <div className="pointer-events-auto relative rounded-2xl border border-ink/10 bg-shell/85 backdrop-blur">
          <DragScroll className="flex items-center gap-2 overflow-x-auto rounded-2xl px-3 py-2">
            {CATS.map((c) => {
              const on = active.length === 0 || active.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggle(c.id)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on ? "border-ink/20 bg-ink/10 text-ink" : "border-ink/10 text-ink3"}`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color, opacity: on ? 1 : 0.4 }} />{c.label}
                </button>
              );
            })}
          </DragScroll>
          {/* hint that the row keeps going */}
          <span className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-2xl bg-gradient-to-l from-shell/85 to-transparent" />
        </div>
        <DragScroll className="pointer-events-auto flex items-center gap-2 overflow-x-auto">
          <Seg label="Radius" value={String(radius)} opts={[["0.5", "½mi"], ["1", "1mi"], ["1.5", "1.5mi"], ["3", "3mi"]]} onChange={(v) => setRadius(parseFloat(v))} />
          <Seg label="When" value={String(days)} opts={[["7", "7d"], ["30", "30d"], ["90", "90d"]]} onChange={(v) => setDays(parseInt(v))} />
        </DragScroll>
      </div>

      {/* bottom feed sheet */}
      <div className={`absolute inset-x-0 bottom-0 z-[1000] rounded-t-3xl border-t border-ink/10 bg-shell/95 backdrop-blur transition-[height] ${expanded ? "h-[62%]" : "h-[150px]"}`}>
        <button onClick={() => setExpanded((e) => !e)} className="flex w-full flex-col items-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-ink/20" />
          <div className="mt-2.5 flex w-full items-center justify-between px-5">
            <span className="text-sm font-semibold text-ink">{incidents.length} incidents · {center.neighborhood}</span>
            <span className="text-xs text-ink2">{expanded ? "Collapse ▾" : "See all ▴"}</span>
          </div>
        </button>
        <div className="scroll-area mt-2 divide-y divide-ink/5 px-1 pb-24">
          {sorted.map((i) => (
            <div key={i.incident_id} className="flex items-start gap-3 px-5 py-3.5">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATS.find((c) => c.id === i.category)?.color || "#64748b" }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{i.type}</span>
                  <span className="shrink-0 rounded bg-ink/5 px-1.5 text-[10px] text-ink2">sev {i.severity}</span>
                  {!i.verified && <span className="shrink-0 rounded bg-ink3/20 px-1.5 text-[10px] text-ink2">unverified</span>}
                </div>
                <div className="truncate text-xs text-ink2">{i.block}, {i.neighborhood}</div>
                <div className="mt-0.5 text-[11px] text-ink3">{timeAgo(i.occurred_at)} · {i.source_label}{i.corroborating_sources.length > 0 && <span className="text-brand"> · +{i.corroborating_sources.length} corroborating</span>}</div>
              </div>
            </div>
          ))}
          {!sorted.length && <p className="px-5 py-8 text-center text-sm text-ink3">No incidents match these filters.</p>}
        </div>
      </div>
    </div>
  );
}

function Seg({ label, value, opts, onChange }: { label: string; value: string; opts: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-ink/10 bg-shell/85 px-1 py-1 backdrop-blur">
      <span className="px-1.5 text-[10px] uppercase tracking-wide text-ink3">{label}</span>
      {opts.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${value === v ? "bg-brand text-white" : "text-ink2"}`}>{l}</button>
      ))}
    </div>
  );
}
