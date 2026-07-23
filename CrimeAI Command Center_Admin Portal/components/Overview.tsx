"use client";

import { useEffect, useState } from "react";
import { supabase, countOf, bucketByDay } from "@/lib/admin";
import { StatCard, Panel, Spark, Badge } from "@/components/ui";

interface Kpis {
  users: number; posts: number; likes: number; comments: number; follows: number;
  events24: number; feedbackNew: number; issuesOpen: number; banned: number; reports: number;
}

export default function Overview() {
  const [k, setK] = useState<Kpis | null>(null);
  const [signups, setSignups] = useState<{ day: string; n: number }[]>([]);
  const [activity, setActivity] = useState<{ day: string; n: number }[]>([]);
  const [health, setHealth] = useState<{ api: number | null; auth: boolean }>({ api: null, auth: false });

  useEffect(() => {
    (async () => {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const [users, posts, likes, comments, follows, events24, feedbackNew, issuesOpen, banned, reports] = await Promise.all([
        countOf("profiles"), countOf("posts"), countOf("likes"), countOf("comments"), countOf("follows"),
        countOf("events", (q) => q.gte("created_at", dayAgo)),
        countOf("feedback", (q) => q.eq("status", "new")),
        countOf("issues", (q) => q.neq("status", "resolved")),
        countOf("profiles", (q) => q.eq("banned", true)),
        countOf("posts", (q) => q.eq("kind", "report")),
      ]);
      setK({ users, posts, likes, comments, follows, events24, feedbackNew, issuesOpen, banned, reports });

      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const [{ data: profs }, { data: evts }] = await Promise.all([
        supabase.from("profiles").select("created_at").gte("created_at", since),
        supabase.from("events").select("created_at").gte("created_at", since).limit(5000),
      ]);
      setSignups(bucketByDay(profs || [], 14));
      setActivity(bucketByDay(evts || [], 14));

      // live health probes — REST round-trip latency + auth service
      const t0 = performance.now();
      await supabase.from("posts").select("id", { head: true, count: "exact" });
      const api = Math.round(performance.now() - t0);
      let auth = false;
      try {
        const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } });
        auth = r.ok;
      } catch {}
      setHealth({ api, auth });
    })();
  }, []);

  if (!k) return <p className="py-16 text-center text-sm text-ink3">Loading command center…</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total users" value={k.users} sub={`${k.banned} banned`} />
        <StatCard label="Posts" value={k.posts} sub={`${k.reports} map reports`} />
        <StatCard label="Engagement" value={k.likes + k.comments} sub={`${k.likes} likes · ${k.comments} comments`} />
        <StatCard label="Follows" value={k.follows} />
        <StatCard label="Events (24h)" value={k.events24} sub="tracked user actions" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Signups — last 14 days"><Spark data={signups} height={64} /></Panel>
        <Panel title="Activity (events) — last 14 days"><Spark data={activity} height={64} /></Panel>
        <Panel title="System health">
          <div className="space-y-2.5 text-sm">
            <Row label="Database / REST API" value={health.api != null ? `${health.api}ms` : "…"} tone={health.api != null && health.api < 400 ? "ok" : "warn"} />
            <Row label="Auth service" value={health.auth ? "healthy" : "checking…"} tone={health.auth ? "ok" : "warn"} />
            <Row label="Open feedback" value={String(k.feedbackNew)} tone={k.feedbackNew > 0 ? "warn" : "ok"} />
            <Row label="Open issues" value={String(k.issuesOpen)} tone={k.issuesOpen > 0 ? "warn" : "ok"} />
          </div>
        </Panel>
      </div>

      <Panel title="Platform guardrails (enforced in product)">
        <div className="flex flex-wrap gap-2">
          <Badge tone="ok">No facial recognition</Badge>
          <Badge tone="ok">No race/ethnicity descriptors</Badge>
          <Badge tone="ok">No predictive policing</Badge>
          <Badge tone="ok">Cited public data only</Badge>
          <Badge tone="ok">911 escalation messaging</Badge>
          <Badge tone="ok">Row-level security on all tables</Badge>
        </div>
      </Panel>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink2">{label}</span>
      <span className={tone === "ok" ? "font-semibold text-ok" : "font-semibold text-warn"}>{value}</span>
    </div>
  );
}
