"use client";

import { useEffect, useState } from "react";
import { supabase, audit, countOf, timeAgo, type Admin } from "@/lib/admin";
import { Badge, Btn, Input, Panel, Td, Th } from "@/components/ui";

interface ProfileRow {
  id: string; name: string; email: string; handle: string | null; neighborhood: string;
  banned: boolean; banned_reason: string | null; onboarded: boolean; created_at: string;
}
interface Detail { posts: number; likesGiven: number; likesReceived: number; comments: number; followers: number; following: number; events: number; lastEvent: string | null }

export default function Users({ admin }: { admin: Admin }) {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<ProfileRow | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(500);
    setRows((data || []) as ProfileRow[]);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!sel) { setDetail(null); return; }
    let cancel = false;
    (async () => {
      const handle = sel.handle || sel.email?.split("@")[0] || "";
      const [posts, likesGiven, comments, followers, following, events] = await Promise.all([
        countOf("posts", (x) => x.eq("user_id", sel.id)),
        countOf("likes", (x) => x.eq("user_id", sel.id)),
        countOf("comments", (x) => x.eq("user_id", sel.id)),
        countOf("follows", (x) => x.eq("target_handle", handle)),
        countOf("follows", (x) => x.eq("follower_id", sel.id)),
        countOf("events", (x) => x.eq("user_id", sel.id)),
      ]);
      const [{ data: own }, { data: lastEv }] = await Promise.all([
        supabase.from("posts").select("likes").eq("user_id", sel.id),
        supabase.from("events").select("created_at").eq("user_id", sel.id).order("created_at", { ascending: false }).limit(1),
      ]);
      if (cancel) return;
      setDetail({
        posts, likesGiven, comments, followers, following, events,
        likesReceived: (own || []).reduce((s, p) => s + (p.likes || 0), 0),
        lastEvent: lastEv?.[0]?.created_at || null,
      });
    })();
    return () => { cancel = true; };
  }, [sel]);

  async function setBan(user: ProfileRow, banned: boolean) {
    const reason = banned ? window.prompt("Reason for ban (recorded in audit log):", "Community guidelines violation") : null;
    if (banned && reason === null) return;
    setBusy(true);
    await supabase.from("profiles").update({ banned, banned_reason: reason, banned_at: banned ? new Date().toISOString() : null }).eq("id", user.id);
    await audit(admin, banned ? "ban_user" : "unban_user", user.email, { reason });
    await load();
    setSel((s) => (s && s.id === user.id ? { ...s, banned, banned_reason: reason } : s));
    setBusy(false);
  }

  const filtered = rows.filter((r) => !q || `${r.name} ${r.email} ${r.handle} ${r.neighborhood}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel title={`Users (${rows.length})`} action={<div className="w-64"><Input placeholder="Search name, email, handle, area…" value={q} onChange={(e) => setQ(e.target.value)} /></div>}>
        <div className="max-h-[64vh] overflow-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line">
              <Th>User</Th><Th>Handle</Th><Th>Neighborhood</Th><Th>Status</Th><Th>Joined</Th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => setSel(r)} className={`cursor-pointer hover:bg-white/5 ${sel?.id === r.id ? "bg-white/5" : ""}`}>
                  <Td><div className="font-medium">{r.name}</div><div className="text-xs text-ink3">{r.email}</div></Td>
                  <Td className="text-ink2">@{r.handle || r.email?.split("@")[0]}</Td>
                  <Td className="text-ink2">{r.neighborhood || "—"}</Td>
                  <Td>{r.banned ? <Badge tone="bad">Banned</Badge> : r.onboarded ? <Badge tone="ok">Active</Badge> : <Badge tone="warn">Onboarding</Badge>}</Td>
                  <Td className="text-ink3">{timeAgo(r.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={sel ? sel.name : "User detail"}>
        {!sel ? <p className="py-10 text-center text-sm text-ink3">Select a user to inspect engagement, behavior and moderation controls.</p> : (
          <div className="space-y-4">
            <div>
              <div className="text-sm text-ink2">{sel.email}</div>
              <div className="text-xs text-ink3">@{sel.handle || sel.email?.split("@")[0]} · {sel.neighborhood || "no area"} · joined {timeAgo(sel.created_at)}</div>
              {sel.banned && <div className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">Banned — {sel.banned_reason || "no reason recorded"}</div>}
            </div>
            {detail ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Cell k="Posts" v={detail.posts} /><Cell k="Followers" v={detail.followers} />
                <Cell k="Following" v={detail.following} /><Cell k="Likes received" v={detail.likesReceived} />
                <Cell k="Likes given" v={detail.likesGiven} /><Cell k="Comments" v={detail.comments} />
                <Cell k="Tracked events" v={detail.events} />
                <Cell k="Last active" v={detail.lastEvent ? timeAgo(detail.lastEvent) : "—"} />
              </div>
            ) : <p className="text-sm text-ink3">Loading engagement…</p>}
            <div className="flex gap-2">
              {sel.banned
                ? <Btn tone="ok" onClick={() => setBan(sel, false)} disabled={busy}>Unban user</Btn>
                : <Btn tone="danger" onClick={() => setBan(sel, true)} disabled={busy}>Ban user</Btn>}
            </div>
            <p className="text-[11px] text-ink3">Bans take effect immediately: the app blocks login and the database rejects new posts from banned accounts. Every action is written to the audit log.</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Cell({ k, v }: { k: string; v: number | string }) {
  return <div className="rounded-lg border border-line bg-card2 px-3 py-2"><div className="text-[11px] uppercase tracking-wide text-ink3">{k}</div><div className="font-semibold">{typeof v === "number" ? v.toLocaleString() : v}</div></div>;
}
