"use client";

// Full-screen CrimeAI news reader. The summary is prefetched when the feed
// loads, so it's already here on open (falls back to the article's own text
// instantly if the CrimeAI summary is still in flight — never a blocking wait).
// The hero uses the article's hi-res og:image; "Read full article" opens the
// source in the in-app browser. Likes / comments / share mirror the feed card.

import { useEffect, useState } from "react";
import type { Post } from "@/lib/social";
import { getArticleDetail, cachedDetail } from "@/lib/news";
import { openInApp } from "@/lib/inappbrowser";
import Logo from "@/components/Logo";
import { Heart, Comment as CommentIcon, Share } from "@/components/Icons";

export interface NewsView {
  post: Post; liked: boolean; likeCount: number; commentCount: number;
  onLike: () => void; onComment: () => void; onShare: () => void;
}

export default function NewsArticle({ v, onClose }: { v: NewsView; onClose: () => void }) {
  const { post } = v;
  const url = post.url || "";
  const braveImg = post.media?.url || null;

  const cached = cachedDetail(url);
  // Start with whatever we already have — cached CrimeAI summary, or the
  // article's own blurb — so there's never an empty "Summarizing…" state.
  const [summary, setSummary] = useState(cached?.summary || post.description || "");
  const [image, setImage] = useState<string | null>(cached?.image || braveImg);
  const [refining, setRefining] = useState(!cached);

  useEffect(() => {
    if (cached) { setRefining(false); return; }
    let alive = true;
    getArticleDetail({ url, title: post.text, description: post.description, source: post.source })
      .then((d) => { if (!alive) return; if (d.summary) setSummary(d.summary); if (d.image) setImage(d.image); })
      .finally(() => { if (alive) setRefining(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div className="fade-in fixed inset-0 z-[1300] flex flex-col bg-shell">
      <div className="safe-top flex items-center gap-2 border-b border-ink/10 px-3 pb-3 pt-4">
        <button onClick={onClose} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full text-ink2 active:scale-95">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="text-sm font-bold text-ink">News</span>
      </div>

      <div className="scroll-area flex-1 px-5 py-5">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="mb-4 max-h-[46vh] w-full rounded-2xl bg-card object-cover" onError={() => setImage(braveImg && braveImg !== image ? braveImg : null)} />
        )}
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px]">
          <span className="rounded bg-blu/15 px-1.5 py-0.5 font-semibold text-blu">NEWS</span>
          {post.source && <span className="text-ink2">{post.source}</span>}
        </div>
        <h1 className="text-lg font-bold leading-snug text-ink">{post.text}</h1>

        <div className="mt-5 flex items-center gap-2">
          <Logo size={22} />
          <span className="text-xs font-bold uppercase tracking-wide text-brand">CrimeAI summary</span>
          {refining && <span className="text-[10px] text-ink3">· refining…</span>}
        </div>
        <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-ink/10 bg-card p-4 text-[15px] leading-relaxed text-ink">
          {summary || "Read the full article below for the details."}
        </div>

        {/* engagement — mirrors the feed card */}
        <div className="mt-4 flex items-center gap-6 border-t border-ink/10 pt-3 text-ink2">
          <button onClick={v.onLike} className={`flex items-center gap-1.5 text-sm ${v.liked ? "text-red-400" : ""}`}><Heart size={19} filled={v.liked} /> {v.likeCount}</button>
          <button onClick={v.onComment} className="flex items-center gap-1.5 text-sm"><CommentIcon size={19} /> {v.commentCount}</button>
          <button onClick={v.onShare} className="flex items-center gap-1.5 text-sm"><Share size={18} /> {post.shares}</button>
        </div>

        <p className="mt-3 px-1 text-[11px] leading-relaxed text-ink3">
          Summarized by CrimeAI — read the full article for complete, verified details.
        </p>
      </div>

      <div className="safe-bottom border-t border-ink/10 px-5 pb-4 pt-3">
        <button onClick={() => openInApp(url)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-sm font-semibold text-white active:scale-[0.99]">
          Read full article
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M7 7h10v10" /></svg>
        </button>
      </div>
    </div>
  );
}
