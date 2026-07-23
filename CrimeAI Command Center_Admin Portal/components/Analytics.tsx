"use client";

import { useEffect, useState } from "react";
import { supabase, bucketByDay } from "@/lib/admin";
import { Panel, Spark, Td, Th, Badge } from "@/components/ui";

interface EventRow { name: string; created_at: string; user_id: string | null }
interface TopPost { author: string; handle: string; text: string; kind: string; likes: number; comments: number; shares: number }

export default function Analytics() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [top, setTop] = useState<TopPost[]>([]);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const [{ data: evts }, { data: posts }] = await Promise.all([
        supabase.from("events").select("name, created_at, user_id").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
        supabase.from("posts").select("author, handle, text, kind, likes, comments, shares").order("likes", { ascending: false }).limit(300),
      ]);
      setEvents((evts || []) as EventRow[]);
      const scored = (posts || []).map((p) => ({ ...p, score: p.likes + p.comments * 3 + p.shares * 2 }));
      scored.sort((a, b) => b.score - a.score);
      setTop(scored.slice(0, 10));
    })();
  }, []);

  const byName = events.reduce<Record<string, EventRow[]>>((acc, e) => { (acc[e.name] ||= []).push(e); return acc; }, {});
  const names = Object.keys(byName).sort((a, b) => byName[b].length - byName[a].length);
  const dau = new Set(events.filter((e) => Date.now() - +new Date(e.created_at) < 86400000).map((e) => e.user_id)).size;
  const wau = new Set(events.filter((e) => Date.now() - +new Date(e.created_at) < 7 * 86400000).map((e) => e.user_id)).size;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Active users (from tracked events)">
          <div className="flex gap-6">
            <div><div className="text-3xl font-bold">{dau}</div><div className="text-xs text-ink2">daily active</div></div>
            <div><div className="text-3xl font-bold">{wau}</div><div className="text-xs text-ink2">weekly active</div></div>
            <div><div className="text-3xl font-bold">{events.length.toLocaleString()}</div><div className="text-xs text-ink2">events · 14 days</div></div>
          </div>
        </Panel>
        <Panel title="All activity — last 14 days"><Spark data={bucketByDay(events, 14)} height={64} /></Panel>
        <Panel title="Top behaviors">
          <div className="space-y-1.5">
            {names.slice(0, 5).map((n) => (
              <div key={n} className="flex items-center justify-between text-sm">
                <span className="text-ink2">{n}</span><span className="font-semibold">{byName[n].length.toLocaleString()}</span>
              </div>
            ))}
            {!names.length && <p className="text-sm text-ink3">No events yet — they stream in as users act in the app.</p>}
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Behavior breakdown (14 days)">
          <div className="space-y-3">
            {names.map((n) => (
              <div key={n}>
                <div className="mb-1 flex items-center justify-between text-xs"><span className="font-medium text-ink2">{n}</span><span className="text-ink3">{byName[n].length}</span></div>
                <Spark data={bucketByDay(byName[n], 14)} height={26} />
              </div>
            ))}
            {!names.length && <p className="py-6 text-center text-sm text-ink3">Waiting for first events…</p>}
          </div>
        </Panel>
        <Panel title="Top content by engagement">
          <table className="w-full">
            <thead><tr className="border-b border-line"><Th>Post</Th><Th>Kind</Th><Th>Score</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {top.map((p, i) => (
                <tr key={i}>
                  <Td><div className="max-w-xs"><div className="text-xs font-semibold text-ink2">{p.author}</div><div className="truncate text-sm">{p.text}</div></div></Td>
                  <Td><Badge>{p.kind}</Badge></Td>
                  <Td className="font-semibold">{p.likes + p.comments * 3 + p.shares * 2}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
