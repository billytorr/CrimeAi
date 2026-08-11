"use client";

// Full-screen CrimeAI news reader. Summary is prefetched so it's already here
// on open (article text shows instantly as a fallback — never a blocking wait).
// Hero uses the article's hi-res og:image. Likes and comments are real: the
// article is lazily materialized as a @crimeai-owned post, so engagement uses
// the normal real-account machinery and the comment thread is shown inline.
// "Read full article" opens the source in the in-app browser.

import { useEffect, useRef, useState } from "react";
import type { Account } from "@/lib/auth";
import { type Post, type Comment, getComments, addComment, toggleLike, timeAgoShort } from "@/lib/social";
import { getArticleDetail, cachedDetail, ensureThreadPost } from "@/lib/news";
import { openInApp } from "@/lib/inappbrowser";
import Avatar from "@/components/Avatar";
import Logo from "@/components/Logo";
import { Heart, Share, Send } from "@/components/Icons";

export interface NewsView {
  post: Post; liked: boolean; likeCount: number; commentCount: number;
  onLike: () => void; onComment: () => void; onShare: () => void;
}

function stripMd(s: string): string {
  return s
    .replace(/^#{1,6}\s*/gm, "").replace(/\*\*?|__?/g, "").replace(/`+/g, "").replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*[^.!?\n]{1,70}\n+(?=[A-Z0-9])/, "") // leading title/label line
    .trim();
}

export default function NewsArticle({ v, account, onClose }: { v: NewsView; account: Account; onClose: () => void }) {
  const { post } = v;
  const url = post.url || "";
  const braveImg = post.media?.url || null;

  const cached = cachedDetail(url);
  const [summary, setSummary] = useState(stripMd(cached?.summary || post.description || ""));
  const [image, setImage] = useState<string | null>(cached?.image || braveImg);
  const [refining, setRefining] = useState(!cached);

  const [postId, setPostId] = useState<string | null>(null);
  const [threadReady, setThreadReady] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const alive = useRef(true);

  // summary + hi-res image
  useEffect(() => {
    if (cached) { setRefining(false); return; }
    alive.current = true;
    getArticleDetail({ url, title: post.text, description: post.description, source: post.source })
      .then((d) => { if (!alive.current) return; if (d.summary) setSummary(stripMd(d.summary)); if (d.image) setImage(d.image); })
      .finally(() => { if (alive.current) setRefining(false); });
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // materialize the real post, then load its comments
  useEffect(() => {
    let on = true;
    (async () => {
      const id = await ensureThreadPost({ url, title: post.text, image, source: post.source, neighborhood: post.neighborhood });
      if (!on) return;
      setThreadReady(true);
      if (!id) return;
      setPostId(id);
      const list = await getComments(id);
      if (on) setComments(list);
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  function onLike() {
    if (!postId) return;
    const next = !liked;
    setLiked(next); setLikeCount((c) => c + (next ? 1 : -1));
    toggleLike(postId, account.id).catch(() => { setLiked(!next); setLikeCount((c) => c + (next ? -1 : 1)); });
  }

  async function submitComment() {
    const t = draft.trim();
    if (!t || !postId) return;
    setDraft("");
    setComments((c) => [...c, { author: account.name, text: t, ts: new Date().toISOString(), photo: account.profile?.photo }]);
    addComment(postId, account.name, t, account.id).catch(() => {});
  }

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

        {/* engagement */}
        <div className="mt-4 flex items-center gap-6 border-t border-ink/10 pt-3 text-ink2">
          <button onClick={onLike} className={`flex items-center gap-1.5 text-sm ${liked ? "text-red-400" : ""}`}><Heart size={19} filled={liked} /> {likeCount}</button>
          <span className="flex items-center gap-1.5 text-sm">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
            {comments.length}
          </span>
          <button onClick={v.onShare} className="flex items-center gap-1.5 text-sm"><Share size={18} /> Share</button>
        </div>

        {/* comments, inline on the page */}
        <div className="mt-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink3">Comments</p>
          {comments.length === 0 && <p className="text-sm text-ink3">No comments yet — start the conversation.</p>}
          <div className="space-y-3">
            {comments.map((c, i) => (
              <div key={i} className="flex gap-2.5">
                <Avatar photo={c.photo} name={c.author} color="#1b7f3a" size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs"><span className="font-semibold text-ink">{c.author}</span> <span className="text-ink3">· {timeAgoShort(c.ts)}</span></div>
                  <p className="text-sm text-ink2">{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-ink3">
          Summarized by CrimeAI — read the full article for complete, verified details.
        </p>
      </div>

      {/* comment composer + read full article */}
      <div className="safe-bottom border-t border-ink/10 px-4 pb-3 pt-2.5">
        <div className="mb-2 flex items-center gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitComment()}
            placeholder={postId ? "Add a comment…" : threadReady ? "Comments unavailable right now" : "Loading…"} disabled={!postId}
            className="min-w-0 flex-1 rounded-full border border-ink/10 bg-card px-4 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60 disabled:opacity-60" />
          <button onClick={submitComment} disabled={!draft.trim() || !postId} aria-label="Send comment"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white active:scale-95 disabled:opacity-40"><Send size={17} /></button>
        </div>
        <button onClick={() => openInApp(url)}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-brand/40 py-2.5 text-sm font-semibold text-brand active:scale-[0.99]">
          Read full article
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M7 7h10v10" /></svg>
        </button>
      </div>
    </div>
  );
}
