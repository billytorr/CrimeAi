"use client";

// Profile content, structured like the big social platforms:
//   Post    — Facebook-style timeline: full cards, all content types, newest first
//   Reels   — TikTok/Instagram grid: 3 per row, tall tiles, reels only
//   Threads — Meta Threads / X-style text list
//   Saved   — Instagram-style square grid (own profile only)
//   Repost  — posts you reshared (references to the originals; a reposted
//             report keeps ITS pin — reposting never re-pins your location)
//   Reports — square grid of safety reports (public profiles; on your own
//             profile reports live under the Safety tab instead)
import { useEffect, useMemo, useState } from "react";
import type { Account } from "@/lib/auth";
import { gradientFor, timeAgoShort, getProfileDirectory, type Interactions, type Post } from "@/lib/social";
import FeedList from "@/components/FeedList";
import Avatar from "@/components/Avatar";
import { Grid, Film, Report as ReportIcon, Thread as ThreadIcon, Bookmark, Heart, Comment as CommentIcon, Share, Pin, Chevron, Verified, Repost as RepostIcon } from "@/components/Icons";

type SubTab = "post" | "reels" | "threads" | "saved" | "repost" | "reports";

import { catColor } from "@/lib/categories";

export default function ProfileGrid({
  posts, saved, reposted, account, interactions, emptyText, publicView, focusPostId, onFocusConsumed,
}: {
  posts: Post[]; saved?: Post[]; reposted?: Post[]; account: Account; interactions: Interactions; emptyText: string; publicView?: boolean;
  focusPostId?: string | null; onFocusConsumed?: () => void;
}) {
  const [tab, setTab] = useState<SubTab>("post");
  const [open, setOpen] = useState<Post | null>(null);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    getProfileDirectory().then((d) => {
      const m = new Map<string, string>();
      d.forEach((v, h) => { if (v.photo) m.set(h, v.photo); });
      setPhotos(m);
    }).catch(() => {});
  }, []);

  // deep-link from the feed: opening your own post lands directly on it
  useEffect(() => {
    if (!focusPostId) return;
    const target = posts.find((x) => x.id === focusPostId);
    if (!target) return;
    setTab(target.kind === "reel" || target.kind === "live" ? "reels" : target.kind === "thread" ? "threads" : "post");
    setOpen(target);
    onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPostId, posts]);

  const reels = useMemo(() => posts.filter((p) => p.kind === "reel" || p.kind === "live"), [posts]);
  const threads = useMemo(() => posts.filter((p) => p.kind === "thread"), [posts]);
  const reports = useMemo(() => posts.filter((p) => p.kind === "report"), [posts]);

  const TABS: { id: SubTab; label: string; Icon: (p: any) => JSX.Element; n: number }[] = [
    { id: "post", label: "Post", Icon: Grid, n: posts.length },
    { id: "reels", label: "Reels", Icon: Film, n: reels.length },
    { id: "threads", label: "Threads", Icon: ThreadIcon, n: threads.length },
    ...(publicView
      ? [{ id: "reports" as SubTab, label: "Reports", Icon: ReportIcon, n: reports.length }]
      : [
          { id: "saved" as SubTab, label: "Saved", Icon: Bookmark, n: saved?.length || 0 },
          { id: "repost" as SubTab, label: "Repost", Icon: RepostIcon, n: reposted?.length || 0 },
        ]),
  ];

  return (
    <div>
      <div className="flex border-b border-ink/10">
        {TABS.map(({ id, label, Icon, n }) => {
          const on = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${on ? "text-ink" : "text-ink3"}`}>
              <Icon size={18} />
              <span>{label}{n > 0 && <span className={on ? "text-brand" : ""}> {n}</span>}</span>
              {on && <span className="absolute bottom-0 h-0.5 w-12 rounded-full bg-brand" />}
            </button>
          );
        })}
      </div>

      {/* POST — Facebook-style timeline: every content type, full cards */}
      {tab === "post" && (
        posts.length
          ? <FeedList posts={posts} account={account} interactions={interactions} emptyText="" />
          : <Empty text={emptyText} />
      )}

      {/* REELS — TikTok/IG grid, reels only */}
      {tab === "reels" && (
        reels.length ? (
          <div className="grid grid-cols-3 gap-[2px] pt-[2px]">
            {reels.map((p) => <Tile key={p.id} post={p} tall onOpen={() => setOpen(p)} />)}
          </div>
        ) : <Empty text="No reels yet." />
      )}

      {/* THREADS — Meta Threads / X-style text rows */}
      {tab === "threads" && (
        threads.length ? (
          <div className="divide-y divide-ink/5">
            {threads.map((p) => <ThreadRow key={p.id} post={p} photo={p.mine ? account.profile?.photo : photos.get(p.handle)} onOpen={() => setOpen(p)} />)}
          </div>
        ) : <Empty text="No threads yet." />
      )}

      {/* SAVED — IG-style square grid (own profile) */}
      {tab === "saved" && (
        saved && saved.length ? (
          <div className="grid grid-cols-3 gap-[2px] pt-[2px]">
            {saved.map((p) => <Tile key={p.id} post={p} tall={false} onOpen={() => setOpen(p)} />)}
          </div>
        ) : <Empty text="Nothing saved yet. Tap the bookmark on any post." />
      )}

      {/* REPOST — posts you reshared (originals keep their author + pin) */}
      {tab === "repost" && (
        reposted && reposted.length ? (
          <div className="grid grid-cols-3 gap-[2px] pt-[2px]">
            {reposted.map((p) => <Tile key={p.id} post={p} tall={false} onOpen={() => setOpen(p)} />)}
          </div>
        ) : <Empty text="Nothing reposted yet. Tap the repost arrows on any post to share it here." />
      )}

      {/* REPORTS — public profiles: their community safety reports */}
      {tab === "reports" && (
        reports.length ? (
          <div className="grid grid-cols-3 gap-[2px] pt-[2px]">
            {reports.map((p) => <Tile key={p.id} post={p} tall={false} onOpen={() => setOpen(p)} />)}
          </div>
        ) : <Empty text="No safety reports yet." />
      )}

      {/* full-post viewer */}
      {open && (
        <div className="fade-in absolute inset-0 z-[1250] flex flex-col bg-shell">
          <div className="safe-top flex items-center gap-3 border-b border-ink/10 px-4 pb-3 pt-4">
            <button onClick={() => setOpen(null)} className="-ml-1 text-ink2" aria-label="Back">
              <Chevron size={22} style={{ transform: "rotate(180deg)" }} />
            </button>
            <span className="text-sm font-semibold capitalize">{open.kind === "live" ? "Reel" : open.kind}</span>
          </div>
          <div className="scroll-area pb-10">
            <FeedList posts={[open]} account={account} interactions={interactions} emptyText="" />
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-8 py-12 text-center text-sm text-ink3">{text}</p>;
}

// X / Meta-Threads-style row: avatar rail, name + @handle + time, text
// (with connected thread parts), muted engagement row.
function ThreadRow({ post, photo, onOpen }: { post: Post; photo?: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="block w-full px-5 py-4 text-left active:bg-ink/5">
      <div className="flex gap-3">
        <Avatar photo={photo} name={post.author} color={post.color} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-semibold">{post.author}</span>
            {post.verified && <Verified size={12} />}
            <span className="text-xs text-ink3">@{post.handle} · {timeAgoShort(post.createdAt)}</span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{post.text}</p>
          {post.thread && post.thread.length > 0 && (
            <div className="mt-2 space-y-2 border-l-2 border-ink/10 pl-3">
              {post.thread.map((t, i) => <p key={i} className="text-sm leading-relaxed text-ink2">{t}</p>)}
            </div>
          )}
          <div className="mt-2.5 flex items-center gap-5 text-xs text-ink3">
            <span className="flex items-center gap-1"><Heart size={14} /> {post.likes}</span>
            <span className="flex items-center gap-1"><CommentIcon size={14} /> {post.comments}</span>
            <span className="flex items-center gap-1"><Share size={13} /> {post.shares}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function Tile({ post, tall, onOpen }: { post: Post; tall: boolean; onOpen: () => void }) {
  const aspect = tall ? "aspect-[3/4]" : "aspect-square"; // TikTok-tall reels, square otherwise
  return (
    <button onClick={onOpen} className={`relative overflow-hidden bg-card ${aspect} active:opacity-80`}>
      {post.media?.type === "video" ? (
        <video src={post.media.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : post.media?.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.media.url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 p-2.5 text-left" style={{ background: gradientFor(post.id) }}>
          <span className="absolute inset-0 bg-black/30" />
          <span className="relative line-clamp-5 text-[11px] font-medium leading-snug text-white">{post.text}</span>
        </span>
      )}

      {post.kind === "live" && (
        <span className="absolute left-1.5 top-1.5 rounded bg-signal-red px-1.5 py-0.5 text-[9px] font-bold text-white">
          {post.isLive ? "LIVE" : "REPLAY"}
        </span>
      )}
      {post.media?.type === "video" && post.kind !== "live" && (
        <span className="absolute right-1.5 top-1.5 text-white drop-shadow">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </span>
      )}
      {post.kind === "report" && post.category && (
        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: catColor(post.category) }} />
          {post.category}
        </span>
      )}

      <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[10px] font-semibold text-white drop-shadow">
        <Heart size={11} filled /> {post.likes}
      </span>
      {post.kind === "report" && !post.media && (
        <span className="absolute bottom-1.5 right-1.5 text-white/90"><Pin size={11} /></span>
      )}
    </button>
  );
}
