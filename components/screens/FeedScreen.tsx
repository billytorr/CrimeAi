"use client";

import { useEffect, useMemo, useState } from "react";
import type { Account } from "@/lib/auth";
import { getFeed, getInteractions, trendingScore, rankForYou, type Post, type Interactions } from "@/lib/social";
import { fetchLocalNews, articleToPost } from "@/lib/news";
import { milesBetween } from "@/lib/data";
import FeedList from "@/components/FeedList";
import { SosPill } from "@/components/SOS";
import { Plus, Search } from "@/components/Icons";
import { useT } from "@/components/LanguageProvider";

type FeedTab = "foryou" | "local" | "news" | "trending";
const TABS: [FeedTab, string][] = [["foryou", "For You"], ["local", "Local"], ["news", "News"], ["trending", "Trending"]];

export default function FeedScreen({ account, onCompose, onSos, onSearch, refreshKey }: { account: Account; onCompose: () => void; onSos: () => void; onSearch: () => void; refreshKey: number }) {
  const p = account.profile!;
  const tr = useT();
  const [tab, setTab] = useState<FeedTab>("foryou");
  const [all, setAll] = useState<Post[]>([]);
  const [news, setNews] = useState<Post[]>([]);
  const [inter, setInter] = useState<Interactions>({ likes: new Set(), saves: new Set(), follows: new Set(), requested: new Set(), reposts: new Set() });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [feed, interactions] = await Promise.all([getFeed(account.id), getInteractions(account.id)]);
      if (!cancel) { setAll(feed); setInter(interactions); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [account.id, refreshKey]);

  // Live local news for the user's coverage area — real articles from outlets
  // that cover where they live, so every user opens the app to current, local,
  // safety-relevant news. Not stored; refreshed on location change.
  useEffect(() => {
    let cancel = false;
    (async () => {
      const arts = await fetchLocalNews({ neighborhood: p.location.neighborhood, city: p.location.city, state: p.location.state });
      if (!cancel) setNews(arts.map((a) => articleToPost(a, p.location.neighborhood)));
    })();
    return () => { cancel = true; };
  }, [p.location.neighborhood, p.location.city, p.location.state, refreshKey]);

  const shown = useMemo(() => {
    // News tab = the live local-news layer (recent first).
    if (tab === "news") return news;
    if (tab === "trending") return [...all].sort((a, b) => trendingScore(b) - trendingScore(a));
    if (tab === "local") return all.filter((x) => x.kind !== "news" && milesBetween(p.location.lat, p.location.lon, x.lat, x.lon) <= 4);
    // For You: rank posts by location + following + interests, and thread in a
    // few of the freshest local news items so users stay informed.
    const ranked = rankForYou(all, {
      lat: p.location.lat, lon: p.location.lon, neighborhood: p.location.neighborhood,
      follows: inter.follows, interests: p.alerts.categories,
    });
    if (!news.length) return ranked;
    const out = [...ranked];
    news.slice(0, 6).forEach((n, i) => out.splice(Math.min(out.length, 3 + i * 4), 0, n)); // interleave
    return out;
  }, [all, news, tab, p.location.lat, p.location.lon, p.location.neighborhood, p.alerts.categories, inter.follows]);

  return (
    <div className="flex h-full flex-col">
      <div className="safe-top z-10 border-b border-ink/10 bg-shell/80 px-5 pb-0 pt-4 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <h1 className="bg-gradient-to-r from-ink to-brand bg-clip-text text-xl font-extrabold tracking-tight text-transparent">{tr("Feed")}</h1>
          <div className="flex items-center gap-2">
            {account.profile?.sosEnabled !== false && <SosPill onClick={onSos} />}
            <button onClick={onSearch} className="grid h-9 w-9 place-items-center rounded-full bg-ink/8 text-ink active:scale-95" aria-label="Search"><Search size={19} /></button>
            <button onClick={onCompose} className="grid h-9 w-9 place-items-center rounded-full bg-brand text-white active:scale-95" aria-label="Create post"><Plus size={20} /></button>
          </div>
        </div>
        <div className="mt-2 flex gap-5 text-sm">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`relative pb-2.5 font-semibold transition ${tab === id ? "text-ink" : "text-ink3"}`}>
              {tr(label)}{tab === id && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-area pb-24">
        {loading ? <p className="px-5 py-12 text-center text-sm text-ink3">Loading your feed…</p>
          : <FeedList posts={shown} account={account} interactions={inter} emptyText={
              tab === "local" ? "No local posts nearby yet — tap + to be the first."
              : tab === "news" ? "Pulling in local news for your area…"
              : "Nothing here yet."} />}
      </div>
    </div>
  );
}
