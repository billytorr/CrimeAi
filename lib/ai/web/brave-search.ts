// Web search via Brave. Real provider; dormant without BRAVE_API_KEY.
import type { SearchProvider, SearchHit } from "../providers";

export function braveSearch(): SearchProvider {
  const key = process.env.BRAVE_API_KEY;
  return {
    name: "brave",
    configured: !!key,
    async search(query, opts): Promise<SearchHit[]> {
      if (!key) throw new Error("Search provider not configured");
      const params = new URLSearchParams({ q: query, count: String(Math.min(opts?.limit || 6, 10)) });
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: { "X-Subscription-Token": key, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Brave ${res.status}`);
      const data = (await res.json()) as any;
      return (data?.web?.results || []).slice(0, opts?.limit || 6).map((r: any) => ({
        title: r.title, url: r.url, snippet: r.description,
      }));
    },
  };
}
