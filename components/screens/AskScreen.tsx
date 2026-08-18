"use client";

import { apiUrl, authHeaders } from "@/lib/api";
import { usePaymentRegion } from "@/lib/pay/regionPolicy";
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
import ChatComposer from "@/components/chat/ChatComposer";
import { SITUATIONS, situationById } from "@/lib/law/situations";

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
  // Upgrade steering ("Become a Protector") may only render where the
  // PaymentRegionPolicy allows purchase UI (Guideline 3.1.1(a)); elsewhere the
  // feature-gate messages state the limit without selling.
  const canUpsell = usePaymentRegion() === "allowed";
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
          // Speak-to-type: drop the transcript into the composer so they can
          // read/edit before sending (ChatGPT-style dictation), not auto-send.
          if (res.ok && data.text) setInput((prev) => (prev ? prev.trimEnd() + " " : "") + data.text);
          else if (data.upsell) setMessages((m) => [...m, { role: "assistant", text: (canUpsell ? "Voice is a Protector feature. Upgrade in Settings → Become a Protector to talk to me." : "Voice isn't included in your current plan.") }]);
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
          ? (canUpsell ? "Web search is a Protector feature — I can look things up beyond our local crime data. Upgrade in Settings → Become a Protector." : "Web search isn't included in your current plan.")
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
  // Active know-your-rights situation. Set by a pill above the composer; it
  // stays on for the rest of the thread (every follow-up runs the guided flow)
  // until the user clears it or starts a new chat. Voice mode inherits it.
  const [situation, setSituation] = useState<string | null>(null);

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
          ? (canUpsell ? "Reading images is a Protector feature — I can look at a photo, a notice, a report and tell you what matters for your safety. Upgrade in Settings → Become a Protector and share it again." : "Reading images isn't included in your current plan.")
          : (data.error || "I couldn't read that image.");
      setMessages((m) => [...m, { role: "assistant", text }]);
      if (tid && res.ok) saveMessage(userId, tid, { role: "assistant", content: text });
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Network error — please try again." }]);
    } finally { setLoading(false); }
  }

  // A staged non-image attachment (e.g. a PDF/doc). The vision route reads
  // images today, so we're honest about it rather than silently dropping it.
  function attachUnsupported(file: File) {
    setMessages((m) => [
      ...m,
      { role: "user", text: `[Shared a file: ${file.name}]` },
      { role: "assistant", text: "I can read photos and images right now — share a picture and I'll tell you what matters for your safety. Document reading (PDFs, notices) is coming soon." },
    ]);
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

  async function send(q: string, forceThread?: string | null, forceSituation?: string | null) {
    const question = q.trim();
    if (!question || loading) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    const tid = forceThread ?? (await ensureThread(question));
    if (tid) saveMessage(userId, tid, { role: "user", content: question });
    const sit = forceSituation !== undefined ? forceSituation : situation;

    try {
      const res = await fetch(apiUrl("/api/crimeai/ask"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          question, lat: loc.lat, lon: loc.lon, neighborhood: loc.neighborhood,
          address: loc.query, radiusMiles: profile.alerts.radiusMiles, days: 30,
          ...(sit ? { situation: sit } : {}),
        }),
      });
      const data = await res.json();
      let text = data.answer || data.error || "Sorry, I couldn't answer that.";
      if (data.ai?.limited) {
        text += (canUpsell
          ? "\n\n— You've used this month's free AI analysis, so this answer comes straight from the live data. Protectors get a much larger monthly AI allowance (Settings → Become a Protector)."
          : "\n\n— You've used this month's free AI analysis, so this answer comes straight from the live data.");
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
    setSituation(null);
  }

  // A situation pill: sets the flow for the thread and sends its opener as the
  // user's first message — CrimeAI leads with the first move, then asks.
  function startSituation(id: string) {
    const s = situationById(id);
    if (!s) return;
    setSituation(id);
    send(s.opener, undefined, id);
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
          situation={situation}
          onSituationChange={setSituation}
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

      {/* situation pills — know-your-rights flows, IN the conversation.
          ONE rail, ALWAYS visible (old threads too), scrollable by touch or
          drag. Tapping one starts a guided intake in this thread. While a
          situation is active the rail becomes the "Guiding you" banner. */}
      {situation ? (
        <div className="mx-5 mb-2 flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs">
          <span aria-hidden>{situationById(situation)?.emoji}</span>
          <span className="min-w-0 flex-1 truncate font-semibold text-brand">Guiding you: {situationById(situation)?.label}</span>
          <a href="tel:911" className="shrink-0 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white">911</a>
          <button onClick={() => setSituation(null)} aria-label="End guided flow" className="shrink-0 text-ink3">✕</button>
        </div>
      ) : (
        <PillRail>
          {SITUATIONS.map((s) => (
            <button key={s.id} onClick={() => startSituation(s.id)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand active:scale-95">
              <span aria-hidden>{s.emoji}</span>{s.label}
            </button>
          ))}
          {messages.length <= 1 && STARTERS.map((s) => (
            <button key={s} onClick={() => send(s)} className="whitespace-nowrap rounded-full border border-ink/10 bg-ink/5 px-3 py-1.5 text-xs text-ink2 active:scale-95">
              {s}
            </button>
          ))}
        </PillRail>
      )}

      {/* input */}
      {lastEngine && (
        <div className="bg-shell/95 px-5 pt-1.5 text-[10px] text-ink3 backdrop-blur">
          Grounded answer · engine: {ENGINE_LABEL[lastEngine] || lastEngine} · informational only, call 911 in an emergency
        </div>
      )}
      <ChatComposer
        value={input}
        onChange={setInput}
        onSend={(t) => send(t)}
        onWebResearch={webResearch}
        onAttachImage={analyzeImage}
        onAttachUnsupported={attachUnsupported}
        onToggleMic={toggleMic}
        onVoiceMode={() => setVoiceOpen(true)}
        isPro={isPro}
        loading={loading}
        recording={recording}
        webMode={webMode}
        onToggleWeb={() => setWebMode((v) => !v)}
        placeholder={`Ask about ${loc.neighborhood}…`}
      />

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

// One-line horizontal pill rail. Touch scrolls natively (.hscroll); on desktop
// — where the app hides scrollbars and there's no touch — click-and-drag
// scrolls it, so the rail is always reachable. Buttons inside still click
// normally (a drag under ~6px counts as a click).
function PillRail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  return (
    <div
      ref={ref}
      className="hscroll mx-5 mb-2.5 gap-2 pb-1 select-none cursor-grab active:cursor-grabbing"
      onMouseDown={(e) => { const el = ref.current; if (!el) return; drag.current = { x: e.pageX, left: el.scrollLeft, moved: false }; }}
      onMouseMove={(e) => { const el = ref.current, d = drag.current; if (!el || !d) return; const dx = e.pageX - d.x; if (Math.abs(dx) > 6) d.moved = true; el.scrollLeft = d.left - dx; }}
      onMouseUp={() => { drag.current = null; }}
      onMouseLeave={() => { drag.current = null; }}
      onClickCapture={(e) => { if (drag.current?.moved) { e.stopPropagation(); e.preventDefault(); } }}
      onWheel={(e) => { const el = ref.current; if (!el) return; if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; } }}
    >
      {children}
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
