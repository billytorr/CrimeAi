"use client";

import { apiUrl, authHeaders } from "@/lib/api";
import { bandFor } from "@/lib/scoring/bands";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, Profile } from "@/lib/auth";
import type { AreaStats } from "@/lib/types";
import Logo from "@/components/Logo";
import {
  listThreads, createThread, loadMessages, saveMessage, renameThread, deleteThread,
  titleFrom, type AiThread,
} from "@/lib/ai-threads";
import { resizeImage } from "@/lib/photo";
import VoiceConversation, { type VoiceTurn } from "@/components/VoiceConversation";

interface Msg { role: "user" | "assistant"; text: string; engine?: string }

const STARTERS = [
  "Is it safe to walk here tonight?",
  "What's the biggest risk on my block?",
  "How does my area compare to the city average?",
  "Should I worry about car break-ins?",
  "What happened near me this week?",
];

const ENGINE_LABEL: Record<string, string> = { anthropic: "Claude", ollama: "torr-crimeai", fallback: "grounded" };

/** A post can be shared into the assistant — AppShell passes it here. */
export interface AskSeed { postId?: string; text: string }

export default function AskScreen({
  account, name, profile, stats, seed, onSeedConsumed,
}: {
  account: Account; name: string; profile: Profile; stats: AreaStats | null;
  seed?: AskSeed | null; onSeedConsumed?: () => void;
}) {
  const loc = profile.location;
  const first = (name || "").split(" ")[0];
  const isPro = profile.plan === "pro";
  const userId = account.id;

  const greeting: Msg = {
    role: "assistant",
    text: `Hey${first ? " " + first : ""} — I'm CrimeAI. Think of me as your lookout around ${loc.neighborhood}, here whenever you want a second set of eyes. What's on your mind today?`,
  };

  const [messages, setMessages] = useState<Msg[]>([greeting]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<AiThread[]>([]);
  const [drawer, setDrawer] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Voice in: record a short clip, transcribe (Deepgram via /voice/transcribe),
  // drop the text into the composer and send. Protector-only; the mic is
  // hidden for free users, and the route declines them anyway.
  async function toggleMic() {
    if (recording) { recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (!blob.size) return;
        setLoading(true);
        try {
          const res = await fetch(apiUrl("/api/crimeai/voice/transcribe"), {
            method: "POST",
            headers: { "Content-Type": blob.type, ...(await authHeaders()) },
            body: blob,
          });
          const data = await res.json();
          setLoading(false);
          if (res.ok && data.text) send(data.text);
          else if (data.upsell) setMessages((m) => [...m, { role: "assistant", text: "Voice is a Protector feature. Upgrade in Settings → Become a Protector to talk to me." }]);
        } catch { setLoading(false); }
      };
      recRef.current = rec; rec.start(); setRecording(true);
    } catch { /* mic permission denied — silently no-op */ }
  }

  // Voice out: speak an assistant message (ElevenLabs via /voice/speak).
  async function speak(text: string) {
    try {
      const res = await fetch(apiUrl("/api/crimeai/voice/speak"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    } catch { /* playback failure is non-fatal */ }
  }

  // Web research: Tavily returns its OWN summarised answer + sources. We show
  // that, rather than feeding raw pages into CrimeAI's model — which keeps web
  // content out of the model's context until a prompt-injection guard exists.
  async function webResearch(q: string) {
    const question = q.trim();
    if (!question || loading) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    const tid = await ensureThread(question);
    try {
      const res = await fetch(apiUrl("/api/crimeai/web"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ query: question, mode: "research" }),
      });
      const data = await res.json();
      let text: string;
      if (res.ok) {
        const sources = (data.sources || []).slice(0, 4).map((s: any) => `• ${s.title} — ${s.url}`).join("\n");
        text = `${data.summary || "Here's what I found on the web."}${sources ? `\n\nSources:\n${sources}` : ""}\n\n(From a live web search — verify anything important against an official source.)`;
      } else {
        text = data.upsell
          ? "Web search is a Protector feature — I can look things up beyond our local crime data. Upgrade in Settings → Become a Protector."
          : (data.error || "I couldn't complete that web search.");
      }
      setMessages((m) => [...m, { role: "assistant", text }]);
      if (tid && res.ok) saveMessage(userId, tid, { role: "assistant", content: text });
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Network error — please try again." }]);
    } finally { setLoading(false); }
  }
  const [webMode, setWebMode] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Protector image analysis: compress, show it in the thread, send to the
  // vision route (metered ai_vision), render CrimeAI's read. Free users get
  // the upsell the route returns.
  async function analyzeImage(file: File) {
    if (loading) return;
    let dataUrl: string;
    try { dataUrl = await resizeImage(file, 1024); }
    catch { return; }
    setMessages((m) => [...m, { role: "user", text: "[Shared an image]" }]);
    setLoading(true);
    const tid = await ensureThread("Image analysis");
    try {
      const res = await fetch(apiUrl("/api/crimeai/vision"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ image: dataUrl, threadId: tid }),
      });
      const data = await res.json();
      const text = res.ok
        ? data.answer
        : data.upsell
          ? "Reading images is a Protector feature — I can look at a photo, a notice, a report and tell you what matters for your safety. Upgrade in Settings → Become a Protector and share it again."
          : (data.error || "I couldn't read that image.");
      setMessages((m) => [...m, { role: "assistant", text }]);
      if (tid && res.ok) saveMessage(userId, tid, { role: "assistant", content: text });
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Network error — please try again." }]);
    } finally { setLoading(false); }
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const refreshThreads = useCallback(() => {
    if (isPro) listThreads(userId).then(setThreads);
  }, [isPro, userId]);

  // On mount: resume the most recent thread (both tiers get persistence; only
  // Pro gets the drawer to switch between many).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listThreads(userId, isPro ? 50 : 1);
      if (cancelled) return;
      setThreads(list);
      if (list.length) {
        setThreadId(list[0].id);
        const msgs = await loadMessages(list[0].id);
        if (!cancelled && msgs.length) setMessages(msgs.map((m) => ({ role: m.role, text: m.content, engine: m.engine })));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // A shared post opens a fresh thread seeded with the post.
  useEffect(() => {
    if (!seed) return;
    (async () => {
      const id = await createThread(userId, titleFrom(seed.text || "About a post"), seed.postId);
      setThreadId(id);
      setMessages([greeting]);
      refreshThreads();
      const q = `About this post a neighbor shared:\n\n"${seed.text}"\n\nWhat should I make of it?`;
      onSeedConsumed?.();
      send(q, id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  async function ensureThread(firstUserText: string): Promise<string | null> {
    if (threadId) return threadId;
    const id = await createThread(userId, titleFrom(firstUserText));
    setThreadId(id);
    refreshThreads();
    return id;
  }

  async function send(q: string, forceThread?: string | null) {
    const question = q.trim();
    if (!question || loading) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    const tid = forceThread ?? (await ensureThread(question));
    if (tid) saveMessage(userId, tid, { role: "user", content: question });

    try {
      const res = await fetch(apiUrl("/api/crimeai/ask"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          question, lat: loc.lat, lon: loc.lon, neighborhood: loc.neighborhood,
          address: loc.query, radiusMiles: profile.alerts.radiusMiles, days: 30,
        }),
      });
      const data = await res.json();
      let text = data.answer || data.error || "Sorry, I couldn't answer that.";
      if (data.ai?.limited) {
        text += "\n\n— You've used this month's free AI analysis, so this answer comes straight from the live data. Protectors get a much larger monthly AI allowance (Settings → Become a Protector).";
      }
      setMessages((m) => [...m, { role: "assistant", text, engine: data.engine }]);
      if (tid) saveMessage(userId, tid, { role: "assistant", content: text, engine: data.engine });
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Network error — please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  async function newChat() {
    setThreadId(null);
    setMessages([greeting]);
    setDrawer(false);
  }

  async function openThread(t: AiThread) {
    setDrawer(false);
    setThreadId(t.id);
    const msgs = await loadMessages(t.id);
    setMessages(msgs.length ? msgs.map((m) => ({ role: m.role, text: m.content, engine: m.engine })) : [greeting]);
  }

  async function removeThread(t: AiThread) {
    await deleteThread(t.id);
    if (t.id === threadId) newChat();
    refreshThreads();
  }

  const lastEngine = messages.filter((m) => m.engine).slice(-1)[0]?.engine;

  const voiceLoc = loc;
  return (
    <div className="flex h-full flex-col">
      {voiceOpen && (
        <VoiceConversation
          loc={voiceLoc}
          radiusMiles={profile.alerts.radiusMiles}
          onTurn={(t: VoiceTurn) => {
            // every voice turn lands in the text thread + is persisted
            setMessages((m) => [...m, { role: t.role, text: t.text }]);
            (async () => { const tid = await ensureThread(t.text); if (tid) saveMessage(userId, tid, { role: t.role, content: t.text }); })();
          }}
          onClose={() => setVoiceOpen(false)}
        />
      )}
      {/* header */}
      <div className="safe-top flex items-center gap-3 border-b border-ink/10 bg-shell/95 px-5 pb-3 pt-4 backdrop-blur">
        <Logo size={38} />
        <div className="flex-1">
          <div className="text-sm font-bold leading-tight">CrimeAI{isPro && <span className="ml-1.5 rounded bg-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand">Protector</span>}</div>
          <div className="flex items-center gap-1.5 text-xs text-ink2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Watching {loc.neighborhood}
          </div>
        </div>
        {/* Protectors get the ChatGPT-style threads menu here; free keeps the
            Safety Score chip. Billy: nav icon top-right replaces Safe Score. */}
        {isPro ? (
          <div className="flex items-center gap-1">
            <button onClick={newChat} aria-label="New chat" className="grid h-9 w-9 place-items-center rounded-full text-ink2 active:scale-95">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            <button onClick={() => { refreshThreads(); setDrawer(true); }} aria-label="Conversations" className="grid h-9 w-9 place-items-center rounded-full text-ink2 active:scale-95">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
            </button>
          </div>
        ) : (
          stats && <SafetyChip score={stats.safetyScore} />
        )}
      </div>

      {/* messages */}
      <div className="scroll-area space-y-3.5 px-5 py-5">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && <div className="mr-2 mt-0.5 shrink-0"><Logo size={26} /></div>}
            <div className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${
              m.role === "user" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-ink/10 bg-card text-ink"
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="mr-2 mt-0.5"><Logo size={26} /></div>
            <div className="rounded-2xl rounded-bl-md border border-ink/10 bg-card px-4 py-3">
              <span className="inline-flex gap-1"><Dot /><Dot d={0.15} /><Dot d={0.3} /></span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* starters */}
      {messages.length <= 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-2.5">
          {STARTERS.map((s) => (
            <button key={s} onClick={() => send(s)} className="shrink-0 rounded-full border border-ink/10 bg-ink/5 px-3 py-1.5 text-xs text-ink2 active:scale-95">
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
          {isPro && <>
            <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzeImage(f); e.target.value = ""; }} />
            <button onClick={() => imgRef.current?.click()} disabled={loading} aria-label="Share an image"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-ink/10 text-ink2 active:scale-95 disabled:opacity-60">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <button onClick={toggleMic} aria-label={recording ? "Stop dictation" : "Dictate to text"} title="Speak to type"
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full active:scale-95 ${recording ? "bg-brand text-white animate-pulse" : "border border-ink/10 text-ink2"}`}>
              {/* waveform-to-text, deliberately NOT a mic — distinct from the
                  shield voice-conversation button on the far right */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 9v6M8 5v14M12 8v8M16 6v12M20 10v4"/></svg>
            </button>
          </>}
          {isPro && <button onClick={() => setWebMode((v) => !v)} aria-label="Search the web" title="Search the web"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full active:scale-95 ${webMode ? "bg-brand text-white" : "border border-ink/10 text-ink2"}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20"/></svg>
          </button>}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (webMode ? webResearch(input) : send(input))}
            placeholder={`Ask about ${loc.neighborhood}…`}
            className="w-full rounded-full border border-ink/10 bg-card px-4 py-3 text-[15px] outline-none placeholder:text-ink3 focus:border-brand/60"
          />
          <button onClick={() => (webMode ? webResearch(input) : send(input))} disabled={loading} aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white active:scale-95 disabled:opacity-60">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
          {isPro && (
            <button onClick={() => setVoiceOpen(true)} aria-label="Voice conversation" title="Talk with CrimeAI"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand active:scale-95">
              <svg width="20" height="22" viewBox="0 0 24 28" fill="currentColor"><path d="M12 1L3 4.5v7.5c0 5.4 3.8 10.5 9 12.4 5.2-1.9 9-7 9-12.4V4.5L12 1z" opacity="0.2"/><path d="M8 11v3M12 8.5v8M16 11v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* conversations drawer (Protector) */}
      {drawer && (
        <div className="fixed inset-0 z-[80] flex" onClick={() => setDrawer(false)}>
          <div className="flex-1 bg-black/50" />
          <div className="flex w-80 max-w-[85%] flex-col bg-shell shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="safe-top flex items-center justify-between border-b border-ink/10 px-4 pb-3 pt-4">
              <span className="text-sm font-bold">Conversations</span>
              <button onClick={newChat} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">+ New</button>
            </div>
            <div className="scroll-area flex-1 py-2">
              {threads.length === 0 && <p className="px-4 py-8 text-center text-xs text-ink3">No conversations yet.</p>}
              {threads.map((t) => (
                <div key={t.id} className={`group flex items-center gap-2 px-4 py-2.5 active:bg-ink/5 ${t.id === threadId ? "bg-ink/5" : ""}`}>
                  <button onClick={() => openThread(t)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm text-ink">{t.title}</div>
                  </button>
                  <button onClick={() => removeThread(t)} aria-label="Delete conversation" className="shrink-0 text-ink3 active:scale-90">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SafetyChip({ score }: { score: number }) {
  const { color } = bandFor(score);
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
