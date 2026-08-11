import { apiUrl, authHeaders } from "./api";
import type { Post } from "./social";

// Live local-news layer. Articles are fetched by the user's coverage area and
// rendered as feed news cards; they are NOT stored in the posts table (keeps
// engagement 100% real-account). Tapping one opens a CrimeAI summary + a link
// to the full article in the in-app browser.

export interface Article {
  id: string; title: string; description: string; url: string;
  image: string | null; source: string; publishedAt: string | null;
}

export async function fetchLocalNews(loc: { neighborhood?: string; city?: string; state?: string }): Promise<Article[]> {
  try {
    const res = await fetch(apiUrl("/api/news"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(loc),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.articles) ? data.articles : [];
  } catch {
    return [];
  }
}

// Article → feed-shaped news Post (live only). timeAgoShort needs a date, so
// use Brave's ISO page_age when present, otherwise treat it as just-fetched.
export function articleToPost(a: Article, neighborhood: string): Post {
  const iso = a.publishedAt && !Number.isNaN(Date.parse(a.publishedAt)) ? a.publishedAt : new Date().toISOString();
  return {
    id: a.id,
    kind: "news",
    author: a.source,
    handle: "",
    color: "#0284c7",
    verified: true,
    neighborhood,
    lat: 0,
    lon: 0,
    text: a.title,
    description: a.description,
    url: a.url,
    media: a.image ? { type: "image", url: a.image } : undefined,
    source: a.source,
    createdAt: iso,
    likes: 0,
    comments: 0,
    shares: 0,
  };
}
