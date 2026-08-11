"use client";

// Full-screen CrimeAI news reader. Opened from a feed news card. Shows the
// article image + headline, a CrimeAI-generated summary, and a "Read full
// article" button that opens the source in the in-app browser (Instagram-style
// on native). Easy exit via the back chevron.

import { useEffect, useRef, useState } from "react";
import { apiUrl, authHeaders } from "@/lib/api";
import { openInApp } from "@/lib/inappbrowser";
import Logo from "@/components/Logo";

export interface ArticleLite {
  title: string; description?: string; url: string; image?: string | null; source?: string;
}

export default function NewsArticle({ article, onClose }: { article: ArticleLite; onClose: () => void }) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const done = useRef(false);

  useEffect(() => {
    done.current = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/news/summarize"), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ title: article.title, description: article.description, source: article.source }),
        });
        const data = await res.json();
        if (!done.current) setSummary(data.summary || article.description || "");
      } catch {
        if (!done.current) setSummary(article.description || "");
      } finally {
        if (!done.current) setLoading(false);
      }
    })();
    return () => { done.current = true; };
  }, [article.url]);

  return (
    <div className="fade-in fixed inset-0 z-[1300] flex flex-col bg-shell">
      <div className="safe-top flex items-center gap-2 border-b border-ink/10 px-3 pb-3 pt-4">
        <button onClick={onClose} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full text-ink2 active:scale-95">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="text-sm font-bold text-ink">News</span>
      </div>

      <div className="scroll-area flex-1 px-5 py-5">
        {article.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.image} alt="" className="mb-4 aspect-video w-full rounded-2xl object-cover" />
        )}
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px]">
          <span className="rounded bg-blu/15 px-1.5 py-0.5 font-semibold text-blu">NEWS</span>
          {article.source && <span className="text-ink2">{article.source}</span>}
        </div>
        <h1 className="text-lg font-bold leading-snug text-ink">{article.title}</h1>

        <div className="mt-5 flex items-center gap-2">
          <Logo size={22} />
          <span className="text-xs font-bold uppercase tracking-wide text-brand">CrimeAI summary</span>
        </div>
        <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-ink/10 bg-card p-4 text-[15px] leading-relaxed text-ink">
          {loading ? <span className="text-ink3">Summarizing…</span> : (summary || "No summary available — read the full article below.")}
        </div>
        <p className="mt-3 px-1 text-[11px] leading-relaxed text-ink3">
          Summarized by CrimeAI from the headline — read the full article for complete, verified details.
        </p>
      </div>

      <div className="safe-bottom border-t border-ink/10 px-5 pb-4 pt-3">
        <button onClick={() => openInApp(article.url)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-sm font-semibold text-white active:scale-[0.99]">
          Read full article
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M7 7h10v10" /></svg>
        </button>
      </div>
    </div>
  );
}
