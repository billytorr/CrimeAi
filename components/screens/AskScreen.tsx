"use client";

import { apiUrl } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/auth";
import type { AreaStats } from "@/lib/types";
import Logo from "@/components/Logo";

interface Msg { role: "user" | "assistant"; text: string; engine?: string }

const STARTERS = [
  "Is it safe to walk here tonight?",
  "What's the biggest risk on my block?",
  "How does my area compare to the city average?",
  "Should I worry about car break-ins?",
  "What happened near me this week?",
];

const ENGINE_LABEL: Record<string, string> = { anthropic: "Claude", ollama: "torr-crimeai", fallback: "grounded" };

export default function AskScreen({ name, profile, stats }: { name: string; profile: Profile; stats: AreaStats | null }) {
  const loc = profile.location;
  const first = (name || "").split(" ")[0];
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: `Hi${first ? " " + first : ""} — I'm CrimeAI. I'm watching ${loc.neighborhood} for you. Ask me anything about safety around here. I answer with real, cited data and I'll always tell you what I can't see.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || loading) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/crimeai/ask"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          lat: loc.lat,
          lon: loc.lon,
          neighborhood: loc.neighborhood,
          address: loc.query,
          radiusMiles: profile.alerts.radiusMiles,
          days: 30,
        }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", text: data.answer || data.error || "Sorry, I couldn't answer that.", engine: data.engine }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Network error — please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const lastEngine = messages.filter((m) => m.engine).slice(-1)[0]?.engine;

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="safe-top flex items-center gap-3 border-b border-ink/10 bg-shell/95 px-5 pb-3 pt-4 backdrop-blur">
        <Logo size={38} />
        <div className="flex-1">
          <div className="text-sm font-bold leading-tight">CrimeAI</div>
          <div className="flex items-center gap-1.5 text-xs text-ink2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Watching {loc.neighborhood}
          </div>
        </div>
        {stats && <SafetyChip score={stats.safetyScore} />}
      </div>

      {/* messages */}
      <div className="scroll-area space-y-3.5 px-5 py-5">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="mr-2 mt-0.5 shrink-0">
                <Logo size={26} />
              </div>
            )}
            <div
              className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${
                m.role === "user" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-ink/10 bg-card text-ink"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="mr-2 mt-0.5"><Logo size={26} /></div>
            <div className="rounded-2xl rounded-bl-md border border-ink/10 bg-card px-4 py-3">
              <span className="inline-flex gap-1">
                <Dot /><Dot d={0.15} /><Dot d={0.3} />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* starters */}
      {messages.length <= 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-2.5">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="shrink-0 rounded-full border border-ink/10 bg-ink/5 px-3 py-1.5 text-xs text-ink2 active:scale-95"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* input */}
      <div className="border-t border-ink/10 bg-shell/95 px-4 py-3 backdrop-blur">
        {lastEngine && (
          <div className="mb-1.5 px-1 text-[10px] text-ink3">
            Grounded answer · engine: {ENGINE_LABEL[lastEngine] || lastEngine} · informational only, call 911 in an emergency
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder={`Ask about ${loc.neighborhood}…`}
            className="w-full rounded-full border border-ink/10 bg-card px-4 py-3 text-[15px] outline-none placeholder:text-ink3 focus:border-brand/60"
          />
          <button
            onClick={() => send(input)}
            disabled={loading}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white active:scale-95 disabled:opacity-60"
            aria-label="Send"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function SafetyChip({ score }: { score: number }) {
  const color = score >= 75 ? "#1b7f3a" : score >= 55 ? "#86b300" : score >= 40 ? "#d98a00" : "#c0392b";
  return (
    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: `${color}22` }}>
      <span className="text-sm font-bold" style={{ color }}>{score}</span>
      <span className="text-[10px] uppercase tracking-wide text-ink2">safe</span>
    </div>
  );
}

function Dot({ d = 0 }: { d?: number }) {
  return <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-ink2" style={{ animationDelay: `${d}s` }} />;
}
