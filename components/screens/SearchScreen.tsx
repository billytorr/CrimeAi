"use client";

// Crime/law/safety search — TikTok/IG-style full-screen search.
//   Discover state (empty query): trending topics + category chips.
//   Results: segmented tabs — All · Neighbors · Jail · Crime.
//     Neighbors — public CrimeAI profiles
//     Jail      — official Miami-Dade booking records (508k, live feed)
//     Crime     — incidents + community reports by keyword
import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";
import type { Account } from "@/lib/auth";
import { useOpenProfile } from "@/lib/profileContext";
import Avatar from "@/components/Avatar";
import { Search, Close, ProBadge, Pin, Report as ReportIcon } from "@/components/Icons";
import { CATEGORIES, catColor, catShort } from "@/lib/categories";
import { timeAgoShort } from "@/lib/social";

type Scope = "all" | "people" | "jail" | "crime";

interface Results {
  people: { id: string; name: string; handle: string; photo: string; bio: string; neighborhood: string; pro: boolean }[];
  jail: { name: string; bookDate: number | null; charges: string[]; city: string }[];
  incidents: { type: string; category: string; neighborhood: string; block: string; occurredAt: string; severity: number; source: string; verified: boolean }[];
  reports: { id: string; author: string; handle: string; text: string; category: string; neighborhood: string; createdAt: string }[];
}
const EMPTY: Results = { people: [], jail: [], incidents: [], reports: [] };

const TRENDING = ["Vehicle break-ins", "Shots fired", "Package theft", "Domestic", "Robbery", "Scam alert", "Burglary", "Missing person"];

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "people", label: "Neighbors" },
  { id: "jail", label: "Jail records" },
  { id: "crime", label: "Crime" },
];

export default function SearchScreen({ account, onClose }: { account: Account; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [res, setRes] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openProfile = useOpenProfile();
  const loc = account.profile?.location;

  useEffect(() => { inputRef.current?.focus(); }, []);

  // debounced search
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(EMPTY); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ q: term, scope });
      if (loc) { params.set("lat", String(loc.lat)); params.set("lon", String(loc.lon)); }
      fetch(apiUrl(`/api/search?${params}`))
        .then((r) => r.json())
        .then((d) => setRes({ ...EMPTY, ...d }))
        .catch(() => setRes(EMPTY))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, scope, loc?.lat, loc?.lon]);

  const counts = {
    people: res.people.length,
    jail: res.jail.length,
    crime: res.incidents.length + res.reports.length,
  };
  const total = counts.people + counts.jail + counts.crime;
  const searching = q.trim().length >= 2;

  return (
    <div className="absolute inset-0 z-[1200] flex flex-col bg-shell fade-in">
      {/* search bar */}
      <div className="safe-top flex items-center gap-2 border-b border-ink/10 px-4 pb-3 pt-4">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-ink/10 bg-card px-3.5 py-2.5">
          <Search size={17} className="text-ink3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people, jail records, crime…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink3"
            enterKeyHint="search"
          />
          {q && <button onClick={() => setQ("")} className="text-ink3"><Close size={16} /></button>}
        </div>
        <button onClick={onClose} className="shrink-0 text-sm font-semibold text-ink2">Cancel</button>
      </div>

      {/* scope tabs (only while searching) */}
      {searching && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-ink/10 px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SCOPES.map((s) => {
            const n = s.id === "all" ? total : s.id === "people" ? counts.people : s.id === "jail" ? counts.jail : counts.crime;
            const on = scope === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${on ? "bg-brand text-white" : "bg-ink/8 text-ink2"}`}
              >
                {s.label}{n > 0 && <span className={on ? "text-white/80" : "text-ink3"}> · {n}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="scroll-area flex-1 pb-24">
        {!searching ? (
          <Discover onPick={setQ} />
        ) : loading && total === 0 ? (
          <p className="py-16 text-center text-sm text-ink3">Searching…</p>
        ) : total === 0 ? (
          <div className="flex flex-col items-center px-10 py-20 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-ink/5 text-ink3"><Search size={24} /></span>
            <p className="mt-3 text-sm font-semibold">No results for &ldquo;{q}&rdquo;</p>
            <p className="mt-1 text-xs text-ink3">Try a name, a neighborhood, or a crime type like &ldquo;robbery&rdquo; or &ldquo;theft.&rdquo;</p>
          </div>
        ) : (
          <div className="space-y-5 px-4 py-4">
            {/* NEIGHBORS */}
            {(scope === "all" || scope === "people") && res.people.length > 0 && (
              <Section title="Neighbors">
                <div className="space-y-1">
                  {res.people.map((p) => (
                    <button key={p.id} onClick={() => { onClose(); openProfile(p.handle); }} className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left active:bg-ink/5">
                      <Avatar photo={p.photo} name={p.name} color="#1b7f3a" size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-sm font-semibold">{p.name}{p.pro && <ProBadge size={13} />}</div>
                        <div className="truncate text-xs text-ink3">@{p.handle}{p.neighborhood && ` · ${p.neighborhood}`}</div>
                        {p.bio && <div className="truncate text-xs text-ink2">{p.bio}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* JAIL */}
            {(scope === "all" || scope === "jail") && res.jail.length > 0 && (
              <Section title="Jail records" note="Miami-Dade County · public booking data">
                <div className="space-y-2">
                  {res.jail.map((j, i) => (
                    <div key={i} className="rounded-xl border border-ink/10 bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold">{j.name}</span>
                        {j.bookDate && <span className="shrink-0 text-[11px] text-ink3">{new Date(j.bookDate).toLocaleDateString()}</span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {j.charges.map((c, k) => (
                          <span key={k} className="rounded-md bg-signal-red/12 px-2 py-0.5 text-[11px] font-medium text-signal-red">{c}</span>
                        ))}
                      </div>
                      {j.city && <div className="mt-1.5 flex items-center gap-1 text-[11px] text-ink3"><Pin size={11} />{j.city}</div>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* CRIME — incidents */}
            {(scope === "all" || scope === "crime") && res.incidents.length > 0 && (
              <Section title="Crime activity">
                <div className="space-y-1.5">
                  {res.incidents.map((i, k) => (
                    <div key={k} className="flex items-start gap-3 rounded-xl px-1 py-2">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: catColor(i.category) }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{i.type}</span>
                          <span className="shrink-0 rounded bg-ink/8 px-1.5 text-[10px] text-ink2">sev {i.severity}</span>
                          {!i.verified && <span className="shrink-0 rounded bg-ink3/20 px-1.5 text-[10px] text-ink2">unverified</span>}
                        </div>
                        <div className="truncate text-xs text-ink3">{[i.block, i.neighborhood].filter(Boolean).join(", ")} · {catShort(i.category)}</div>
                        <div className="text-[11px] text-ink3">{timeAgoShort(i.occurredAt)} · {i.source}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* CRIME — community reports */}
            {(scope === "all" || scope === "crime") && res.reports.length > 0 && (
              <Section title="Community reports">
                <div className="space-y-1.5">
                  {res.reports.map((r) => (
                    <button key={r.id} onClick={() => { onClose(); openProfile(r.handle); }} className="flex w-full items-start gap-2.5 rounded-xl px-1 py-2 text-left active:bg-ink/5">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: `${catColor(r.category)}22`, color: catColor(r.category) }}><ReportIcon size={14} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm text-ink">{r.text}</div>
                        <div className="text-[11px] text-ink3">@{r.handle}{r.neighborhood && ` · ${r.neighborhood}`} · {timeAgoShort(r.createdAt)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {note && <span className="text-[10px] text-ink3">{note}</span>}
      </div>
      {children}
    </div>
  );
}

function Discover({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="px-5 py-5">
      <h2 className="mb-3 text-sm font-bold text-ink">Trending near you</h2>
      <div className="flex flex-wrap gap-2">
        {TRENDING.map((t) => (
          <button key={t} onClick={() => onPick(t)} className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-card px-3.5 py-2 text-xs font-medium text-ink2 active:scale-95">
            <Search size={12} className="text-ink3" />{t}
          </button>
        ))}
      </div>

      <h2 className="mb-3 mt-7 text-sm font-bold text-ink">Browse by category</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => onPick(c.short)} className="flex items-center gap-2.5 overflow-hidden rounded-2xl border border-ink/10 bg-card p-3 text-left active:scale-[0.98]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${c.color}22`, color: c.color }}>
              <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
            </span>
            <span className="min-w-0 text-xs font-semibold text-ink">{c.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-7 rounded-2xl border border-ink/10 bg-card/60 p-4">
        <h3 className="text-xs font-bold text-ink">Search anything safety-related</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-ink3">
          Find public neighbors, look up Miami-Dade jail booking records by name or charge, or search live crime
          activity and community reports by keyword or neighborhood.
        </p>
      </div>
    </div>
  );
}
