// Web research via Tavily. Real provider; dormant without TAVILY_API_KEY.
import type { ResearchProvider, ResearchResult } from "../providers";

export function tavilyResearch(): ResearchProvider {
  const key = process.env.TAVILY_API_KEY;
  return {
    name: "tavily",
    configured: !!key,
    async research(query): Promise<ResearchResult> {
      if (!key) throw new Error("Research provider not configured");
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key, query,
          search_depth: "advanced",
          include_answer: true,
          max_results: 6,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`Tavily ${res.status}`);
      const data = (await res.json()) as any;
      return {
        summary: data?.answer || "",
        sources: (data?.results || []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content })),
      };
    },
  };
}
