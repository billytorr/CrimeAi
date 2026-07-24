"use client";

import { apiUrl } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAnnouncements, type Announcement } from "@/lib/analytics";
import { accountHandle, type Account } from "@/lib/auth";
import type { Incident } from "@/lib/types";
import { getFeed, getInteractions, getFollowRequests, answerFollowRequest, timeAgoShort, getProfileDirectory, type Post, type FollowRequest, type ProfileLite } from "@/lib/social";
import { getConversations, type Conversation } from "@/lib/messages";
import { milesBetween } from "@/lib/data";
import { Alert, Car, Eye, Flame, Comment as CommentIcon, Report, Messages as MessagesIcon, Bell, Verified } from "@/components/Icons";
import Avatar from "@/components/Avatar";
import MessageThread from "@/components/MessageThread";

const CAT_ICON: Record<string, typeof Alert> = { violent: Alert, property: Car, nuisance: Eye, hazard: Flame };
type Tone = "alert" | "social" | "system";
type Item = { id: string; cat?: string; tone: Tone; title: string; body: string; ts: string };
type Tab = "activity" | "messages";

export default function InboxScreen({ account, refreshKey }: { account: Account; refreshKey: number }) {
  const p = account.profile!;
  const [tab, setTab] = useState<Tab>("activity");
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [reports, setReports] = useState<Post[]>([]);
  const [follows, setFollows] = useState<Set<string>>(new Set());
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [open, setOpen] = useState<Conversation | null>(null);
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [dir, setDir] = useState<Map<string, ProfileLite>>(new Map());

  useEffect(() => { getProfileDirectory().then(setDir).catch(() => {}); }, []);

  useEffect(() => {
    const params = new URLSearchParams({ lat: String(p.location.lat), lon: String(p.location.lon), radius: String(p.alerts.radiusMiles), days: "7" });
    fetch(apiUrl(`/api/incidents?${params}`)).then((r) => r.json()).then((d) => d.incidents && setIncidents(d.incidents)).catch(() => {});
  }, [p.location, p.alerts.radiusMiles]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [feed, inter] = await Promise.all([getFeed(account.id), getInteractions(account.id)]);
      if (cancel) return;
      setReports(feed.filter((x) => x.kind === "report" && !x.mine));
      setFollows(inter.follows);
    })();
    return () => { cancel = true; };
  }, [account.id, refreshKey]);

  const refreshConvos = useCallback(() => setConvos(getConversations(follows)), [follows]);
  useEffect(() => { refreshConvos(); }, [refreshConvos]);
  useEffect(() => { getAnnouncements().then(setAnns).catch(() => {}); }, [refreshKey]);
  const loadRequests = useCallback(() => { getFollowRequests(accountHandle(account)).then(setRequests).catch(() => {}); }, [account]);
  useEffect(() => { loadRequests(); }, [loadRequests, refreshKey]);

  async function answer(r: FollowRequest, approve: boolean) {
    await answerFollowRequest(accountHandle(account), r.followerId, approve).catch(() => {});
    loadRequests();
  }

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    incidents
      .filter((i) => i.severity >= p.alerts.severityMin)
      .filter((i) => p.alerts.categories.length === 0 || p.alerts.categories.includes(i.category))
      .slice(0, 20)
      .forEach((i) => out.push({ id: `al-${i.incident_id}`, cat: i.category, tone: "alert", title: `${i.type} near you`, body: `${i.source_label} · ${i.block}, ${i.neighborhood}${i.corroborating_sources.length ? ` · ${i.corroborating_sources.length + 1} sources` : i.verified ? "" : " · unverified"}`, ts: i.occurred_at }));
    reports
      .filter((post) => milesBetween(p.location.lat, p.location.lon, post.lat, post.lon) <= p.alerts.radiusMiles + 1)
      .slice(0, 8)
      .forEach((post) => out.push({ id: `so-${post.id}`, tone: "social", title: `${post.author} posted a report`, body: post.text.slice(0, 80), ts: post.createdAt }));
    anns.forEach((a) => out.push({ id: `ann-${a.id}`, tone: "system", title: a.title, body: a.body, ts: a.published_at }));
    out.push({ id: "sys-welcome", tone: "system", title: "Welcome to CrimeAI", body: `You're watching ${p.location.neighborhood}. Alerts within ${p.alerts.radiusMiles} mi are on.`, ts: new Date(Date.now() - 3600000).toISOString() });
    return out.sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  }, [incidents, reports, anns, p]);

  const unread = convos.filter((c) => c.unread).length;

  return (
    <div className="flex h-full flex-col">
      <div className="safe-top border-b border-ink/10 bg-shell/95 px-5 pb-2.5 pt-4 backdrop-blur">
        <h1 className="text-lg font-bold">Inbox</h1>
        <div className="mt-2 flex gap-2">
          {([["activity", "Activity"], ["messages", "Messages"]] as [Tab, string][]).map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tab === id ? "bg-ink/15 text-ink" : "text-ink2"}`}>
              {id === "messages" ? <MessagesIcon size={13} /> : <Bell size={13} />}
              {l}{id === "messages" && unread > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-signal-red px-1 text-[10px] font-bold text-ink">{unread}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === "activity" && (
        <div className="scroll-area divide-y divide-ink/5 pb-24">
          {/* follow requests (private-account approvals) come first */}
          {requests.map((r) => (
            <div key={r.followerId} className="flex items-center gap-3 px-5 py-4">
              <Avatar photo={dir.get(r.handle)?.photo} name={r.name} color="#1b7f3a" size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm"><span className="font-semibold">{r.name}</span> <span className="text-ink3">@{r.handle}</span></div>
                <p className="text-xs text-ink2">requested to follow you · {timeAgoShort(r.createdAt)}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => answer(r, true)} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">Approve</button>
                <button onClick={() => answer(r, false)} className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink2">Decline</button>
              </div>
            </div>
          ))}
          {items.map((i) => {
            const Icon = i.tone === "alert" ? CAT_ICON[i.cat || "hazard"] || Alert : i.tone === "social" ? CommentIcon : Report;
            return (
              <div key={i.id} className="flex items-start gap-3 px-5 py-4">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${i.tone === "alert" ? "bg-red-500/15 text-red-300" : i.tone === "social" ? "bg-blu/15 text-blu" : "bg-brand/15 text-brand"}`}><Icon size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-ink">{i.title}</span><span className="shrink-0 text-[11px] text-ink3">{timeAgoShort(i.ts)}</span></div>
                  <p className="truncate text-xs text-ink2">{i.body}</p>
                </div>
              </div>
            );
          })}
          {!items.length && <p className="px-5 py-10 text-center text-sm text-ink3">You're all caught up.</p>}
        </div>
      )}

      {tab === "messages" && (
        <div className="scroll-area pb-24">
          <p className="px-5 py-3 text-xs text-ink3">Message neighbors to coordinate on safety. Follow someone to start a chat.</p>
          <div className="divide-y divide-ink/5">
            {convos.map((c) => (
              <button key={c.handle} onClick={() => setOpen(c)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left active:bg-ink/5">
                <Avatar photo={dir.get(c.handle)?.photo} name={c.name} color={c.color} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 truncate text-sm font-semibold text-ink">{c.name}{c.verified && <span className="text-brand"><Verified size={12} /></span>}</span>
                    <span className="shrink-0 text-[11px] text-ink3">{timeAgoShort(c.ts)}</span>
                  </div>
                  <p className={`truncate text-xs ${c.unread ? "font-semibold text-ink" : "text-ink2"}`}>{c.last}</p>
                </div>
                {c.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />}
              </button>
            ))}
          </div>
          {!convos.length && <p className="px-5 py-10 text-center text-sm text-ink3">No conversations yet. Follow neighbors on the Feed, then message them here.</p>}
        </div>
      )}

      {open && (
        <MessageThread handle={open.handle} name={open.name} color={open.color} verified={open.verified} onClose={() => { setOpen(null); refreshConvos(); }} />
      )}
    </div>
  );
}
