"use client";

import { useEffect, useState } from "react";
import { supabase, audit, timeAgo, type Admin } from "@/lib/admin";
import { Badge, Btn, Panel, Select, Td, Th } from "@/components/ui";

interface PostRow {
  id: string; kind: string; author: string; handle: string; text: string;
  neighborhood: string; likes: number; comments: number; verified: boolean;
  media_url: string | null; media_type: string | null; is_live: boolean; created_at: string;
}

export default function Content({ admin }: { admin: Admin }) {
  const [rows, setRows] = useState<PostRow[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [kind, setKind] = useState("all");
  const [busy, setBusy] = useState("");

  async function load() {
    let q = supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(200);
    if (kind !== "all") q = q.eq("kind", kind);
    const [{ data }, fl] = await Promise.all([q, supabase.from("content_reports").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(100)]);
    setRows((data || []) as PostRow[]);
    setFlags(fl.data || []);
  }

  async function resolveFlag(f: any, action: "reviewed" | "actioned") {
    await supabase.from("content_reports").update({ status: action }).eq("id", f.id);
    await audit(admin, `flag_${action}`, f.post_id, { reason: f.reason });
    load();
  }
  useEffect(() => { load(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(p: PostRow) {
    if (!window.confirm(`Delete this ${p.kind} by ${p.author}? This is permanent and is recorded in the audit log.`)) return;
    setBusy(p.id);
    await supabase.from("posts").delete().eq("id", p.id);
    await audit(admin, "delete_post", `${p.author} (@${p.handle})`, { kind: p.kind, text: p.text.slice(0, 120) });
    await load();
    setBusy("");
  }

  async function toggleVerified(p: PostRow) {
    setBusy(p.id);
    await supabase.from("posts").update({ verified: !p.verified }).eq("id", p.id);
    await audit(admin, p.verified ? "unverify_post" : "verify_post", `${p.author} (@${p.handle})`, {});
    await load();
    setBusy("");
  }

  const kindTone = (k: string) => (k === "report" ? "bad" : k === "news" ? "blue" : k === "live" ? "warn" : "muted") as "bad" | "blue" | "warn" | "muted";

  return (
    <div className="space-y-4">
      {flags.length > 0 && (
        <Panel title={`User flags — needs review (${flags.length})`}>
          <div className="max-h-[30vh] space-y-2 overflow-auto">
            {flags.map((f) => {
              const p = rows.find((r) => r.id === f.post_id);
              return (
                <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2.5">
                  <div className="min-w-0 text-sm">
                    <Badge tone="warn">{f.reason}</Badge>
                    <span className="ml-2 text-ink2">{p ? `${p.author}: ${p.text?.slice(0, 60)}` : `post ${f.post_id?.slice(0, 8)}…`}</span>
                    <span className="ml-2 text-xs text-ink3">{timeAgo(f.created_at)}</span>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Btn small onClick={() => resolveFlag(f, "reviewed")}>Dismiss</Btn>
                    {p && <Btn small tone="danger" onClick={async () => { await remove(p); resolveFlag(f, "actioned"); }}>Delete post</Btn>}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    <Panel
      title={`Content moderation (${rows.length} posts)`}
      action={
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          {["all", "report", "observation", "reel", "thread", "image", "news", "live"].map((k) => <option key={k} value={k}>{k === "all" ? "All kinds" : k}</option>)}
        </Select>
      }
    >
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full">
          <thead><tr className="border-b border-line"><Th>Post</Th><Th>Kind</Th><Th>Area</Th><Th>Engagement</Th><Th>Posted</Th><Th>Actions</Th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-white/5">
                <Td>
                  <div className="max-w-md">
                    <div className="text-xs font-semibold text-ink2">{p.author} <span className="font-normal text-ink3">@{p.handle}</span></div>
                    <div className="truncate text-sm">{p.text || <span className="text-ink3">(media only)</span>}</div>
                    {p.media_url && <a href={p.media_url.startsWith("data:") ? undefined : p.media_url} target="_blank" rel="noreferrer" className="text-[11px] text-blu">{p.media_type || "media"} attached</a>}
                  </div>
                </Td>
                <Td><Badge tone={kindTone(p.kind)}>{p.is_live ? "LIVE" : p.kind}</Badge></Td>
                <Td className="text-ink2">{p.neighborhood || "—"}</Td>
                <Td className="text-ink2">{p.likes} likes · {p.comments} cmts</Td>
                <Td className="text-ink3">{timeAgo(p.created_at)}</Td>
                <Td>
                  <div className="flex gap-1.5">
                    <Btn small onClick={() => toggleVerified(p)} disabled={busy === p.id}>{p.verified ? "Unverify" : "Verify"}</Btn>
                    <Btn small tone="danger" onClick={() => remove(p)} disabled={busy === p.id}>Delete</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
    </div>
  );
}
