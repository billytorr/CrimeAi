"use client";

// Sources — the data operations desk: every feed CrimeAI ingests
// (open-data crime feeds, weather alerts, future scanner/news feeds),
// sync health, and community report management. The `audience` field
// routes each source to a product path — the consumer app today,
// police-unit monitoring and newsroom broadcast feeds as they launch.
import { useEffect, useState } from "react";
import { supabase, audit, timeAgo, type Admin } from "@/lib/admin";
import { Badge, Btn, Input, Panel, Select, StatCard, Td, TextArea, Th } from "@/components/ui";

const APP_API =
  process.env.NEXT_PUBLIC_APP_API ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://app.publicsafetycrimecenter.com");

const KINDS = [
  { id: "arcgis", label: "ArcGIS FeatureServer" },
  { id: "socrata", label: "Socrata / SODA dataset" },
  { id: "geojson", label: "GeoJSON feed" },
  { id: "nws", label: "NWS weather alerts" },
];
const AUDIENCES = [
  { id: "public", label: "Public app" },
  { id: "police", label: "Police units" },
  { id: "newsroom", label: "News broadcasters" },
];

interface SourceRow {
  id: string; name: string; kind: string; url: string; audience: string;
  enabled: boolean; last_sync: string | null; last_count: number; last_error: string | null;
  config: any;
}

export default function Sources({ admin }: { admin: Admin }) {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [totalLive, setTotalLive] = useState(0);
  const [newest, setNewest] = useState<string | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  // add-source form
  const [nName, setNName] = useState("");
  const [nKind, setNKind] = useState("arcgis");
  const [nUrl, setNUrl] = useState("");
  const [nAudience, setNAudience] = useState("public");
  const [nConfig, setNConfig] = useState("");
  const [addErr, setAddErr] = useState("");

  async function load() {
    try {
      const r = await fetch(`${APP_API}/api/ingest/status`).then((x) => x.json());
      setSources(r.sources || []);
      setTotalLive(r.totalLive || 0);
      setNewest(r.newestIncident || null);
    } catch { setSources([]); }
    const { data } = await supabase.from("posts").select("id, author, handle, category, text, neighborhood, created_at")
      .eq("kind", "report").order("created_at", { ascending: false }).limit(100);
    setReports(data || []);
  }
  useEffect(() => { load(); }, []);

  async function addSource() {
    setAddErr("");
    if (!nName.trim() || !nUrl.trim()) { setAddErr("Name and URL are required."); return; }
    let config = {};
    if (nConfig.trim()) {
      try { config = JSON.parse(nConfig); } catch { setAddErr("Config must be valid JSON (or empty)."); return; }
    }
    const { error } = await supabase.from("data_sources").insert({
      name: nName.trim(), kind: nKind, url: nUrl.trim(), audience: nAudience,
      config, enabled: false, updated_by: admin.email,
    });
    if (error) { setAddErr(error.message); return; }
    await audit(admin, "add_data_source", nName.trim(), { kind: nKind });
    setNName(""); setNUrl(""); setNConfig("");
    await load();
  }

  async function toggleSource(s: SourceRow) {
    await supabase.from("data_sources").update({ enabled: !s.enabled, updated_by: admin.email }).eq("id", s.id);
    await audit(admin, s.enabled ? "disable_data_source" : "enable_data_source", s.name, {});
    await load();
  }

  async function removeSource(s: SourceRow) {
    if (!window.confirm(`Remove source "${s.name}"? Its ingested incidents will be deleted too.`)) return;
    await supabase.from("data_sources").delete().eq("id", s.id);
    await audit(admin, "delete_data_source", s.name, {});
    await load();
  }

  async function syncNow() {
    setSyncing(true); setSyncMsg("");
    try {
      const r = await fetch(`${APP_API}/api/ingest/sync`, { method: "POST" }).then((x) => x.json());
      if (r.ok) {
        const lines = (r.results || []).map((x: any) => x.ok ? `${x.source}: ${x.upserted} records` : `${x.source}: FAILED — ${x.error}`);
        setSyncMsg(lines.length ? lines.join(" · ") : "No sources enabled yet.");
      } else setSyncMsg(r.error || "Sync failed.");
      await audit(admin, "sync_data_sources", "", {});
    } catch { setSyncMsg("Could not reach the app's sync API."); }
    setSyncing(false);
    await load();
  }

  async function deleteReport(p: any) {
    if (!window.confirm(`Delete this community report by ${p.author}?`)) return;
    await supabase.from("posts").delete().eq("id", p.id);
    await audit(admin, "delete_report", p.id, { author: p.handle });
    await load();
  }

  const enabled = sources.filter((s) => s.enabled).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Data sources" value={sources.length} sub={`${enabled} enabled`} />
        <StatCard label="Live incidents ingested" value={totalLive.toLocaleString()} tone={totalLive > 0 ? "ok" : undefined} />
        <StatCard label="Newest incident" value={newest ? timeAgo(newest) : "—"} />
        <StatCard label="Community reports" value={reports.length} />
      </div>

      <Panel title="Connected data sources" action={
        <Btn small tone="brand" onClick={syncNow} disabled={syncing}>{syncing ? "Syncing…" : "Sync now"}</Btn>
      }>
        {syncMsg && <p className="mb-3 text-xs text-ink2">{syncMsg}</p>}
        {!sources.length ? (
          <p className="py-6 text-center text-sm text-ink3">No sources yet — add the first one below. Setup guides for every feed type are in DATA-SOURCES.md in the repo.</p>
        ) : (
          <div className="space-y-2">
            {sources.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-shell/50 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{s.name}</span>
                    <Badge tone="blue">{s.kind}</Badge>
                    <Badge tone={s.audience === "public" ? "ok" : "warn"}>{AUDIENCES.find((a) => a.id === s.audience)?.label || s.audience}</Badge>
                    <Badge tone={s.enabled ? "ok" : "warn"}>{s.enabled ? "enabled" : "off"}</Badge>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-ink3">{s.url}</div>
                  <div className="mt-0.5 text-[11px] text-ink3">
                    {s.last_sync ? <>last sync {timeAgo(s.last_sync)} · {s.last_count} records</> : "never synced"}
                    {s.last_error && <span className="text-brand"> · {s.last_error}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Btn small tone={s.enabled ? undefined : "ok"} onClick={() => toggleSource(s)}>{s.enabled ? "Disable" : "Enable"}</Btn>
                  <Btn small tone="danger" onClick={() => removeSource(s)}>Remove</Btn>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">Add a source</div>
          <div className="grid gap-2 lg:grid-cols-2">
            <Input placeholder="Name shown to users, e.g. Miami-Dade Open Data" value={nName} onChange={(e) => setNName(e.target.value)} />
            <div className="flex gap-2">
              <Select value={nKind} onChange={(e) => setNKind(e.target.value)}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </Select>
              <Select value={nAudience} onChange={(e) => setNAudience(e.target.value)}>
                {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </Select>
            </div>
            <Input placeholder="Feed URL (see DATA-SOURCES.md for the format per kind)" value={nUrl} onChange={(e) => setNUrl(e.target.value)} className="lg:col-span-2" />
            <TextArea rows={2} placeholder='Optional field-mapping JSON, e.g. {"typeField":"offense","dateField":"date_occur"}' value={nConfig} onChange={(e) => setNConfig(e.target.value)} className="lg:col-span-2" />
          </div>
          {addErr && <p className="mt-2 text-xs text-brand">{addErr}</p>}
          <div className="mt-2"><Btn tone="brand" onClick={addSource}>Add source</Btn></div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink3">
            Sources sync automatically every morning and on demand with Sync now. New sources start disabled —
            enable after a successful test sync. The audience tag routes a feed to its product path: the public
            CrimeAI app, dedicated police-unit monitoring, or the news-broadcast desk.
          </p>
        </div>
      </Panel>

      <Panel title={`Community reports (${reports.length})`}>
        {!reports.length ? <p className="py-6 text-center text-sm text-ink3">No community reports yet.</p> : (
          <div className="max-h-[45vh] overflow-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><Th>When</Th><Th>Reporter</Th><Th>Category</Th><Th>Report</Th><Th>Area</Th><Th>{" "}</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {reports.map((p) => (
                  <tr key={p.id}>
                    <Td className="whitespace-nowrap text-ink3">{timeAgo(p.created_at)}</Td>
                    <Td className="text-ink2">{p.author}<div className="text-[11px] text-ink3">@{p.handle}</div></Td>
                    <Td><Badge tone="blue">{p.category || "other"}</Badge></Td>
                    <Td className="max-w-[26rem]"><span className="line-clamp-2 text-ink2">{p.text}</span></Td>
                    <Td className="text-ink3">{p.neighborhood || "—"}</Td>
                    <Td><Btn small tone="danger" onClick={() => deleteReport(p)}>Delete</Btn></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
