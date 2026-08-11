import { NextRequest, NextResponse } from "next/server";

// Local news for the feed, by the user's coverage area. Uses Brave News
// (BRAVE_API_KEY — already configured). Returns normalized articles the client
// renders as news cards and CrimeAI summarizes on open. No storage: this is a
// live layer, so it never pollutes the posts table.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

interface Article {
  id: string; title: string; description: string; url: string;
  image: string | null; source: string; publishedAt: string | null;
}

export async function POST(req: NextRequest) {
  const { neighborhood, city, state, area } = await req.json().catch(() => ({}));
  const key = process.env.BRAVE_API_KEY;
  if (!key) return NextResponse.json({ articles: [], reason: "news_unconfigured" });

  const place = [neighborhood, city, state].filter(Boolean).join(" ").trim() || area || "local";
  // Local + safety-relevant, recent. Brave News returns publisher, thumbnail,
  // and age — exactly what a card needs.
  const q = `${place} crime safety police news`;
  try {
    const params = new URLSearchParams({ q, count: "20", freshness: "pw", spellcheck: "0", country: "us" });
    const res = await fetch(`https://api.search.brave.com/res/v1/news/search?${params}`, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return NextResponse.json({ articles: [], reason: `brave_${res.status}` });
    const data = await res.json();
    const seen = new Set<string>();
    const articles: Article[] = (data.results || [])
      .map((r: any): Article => ({
        id: "news-" + Buffer.from(String(r.url || r.title || "")).toString("base64url").slice(0, 20),
        title: (r.title || "").trim(),
        description: (r.description || "").replace(/<[^>]+>/g, "").trim(),
        url: r.url || "",
        image: r.thumbnail?.src || r.thumbnail?.original || null,
        source: (r.meta_url?.hostname || r.source || "News").replace(/^www\./, ""),
        publishedAt: r.page_age || r.age || null,
      }))
      .filter((a: Article) => a.url && a.title && !seen.has(a.url) && seen.add(a.url));
    return NextResponse.json({ articles });
  } catch (e) {
    return NextResponse.json({ articles: [], reason: (e as Error).message });
  }
}
