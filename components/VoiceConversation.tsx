"use client";

// Talk to CrimeAI — the full-screen voice experience.
//
// Layout (mobile-first, safe-area aware):
//   TOP     minimal CrimeAI identity + short status
//   CENTER  CrimeAIVoiceSphere — a red digital particle core that reacts to
//           CrimeAI's ACTUAL voice (TTS) and, subtly, to yours while listening
//   BOTTOM  [ + | Ask CrimeAI ]   [ mic mute ]   [ ✕ exit ]
//
// Voice and text are two modes of the SAME conversation: every turn (spoken,
// typed, or an attached photo) is handed back via onTurn and persisted by the
// caller. The + menu reuses the shared CrimeAI AttachmentMenu (Camera / Photos
// / Files only). Language follows the app locale (useLang) → STT. TTS playback
// runs through one unlocked AudioContext and feeds the sphere's analyser.
//
// Protector-only (the caller only mounts this for isPro). No settings button,
// no language/model/voice selectors, no live video or screen share.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, authHeaders } from "@/lib/api";
import { resizeImage } from "@/lib/photo";
import { useLang } from "@/components/LanguageProvider";
import CrimeAIVoiceSphere from "@/components/voice/CrimeAIVoiceSphere";
import AttachmentMenu from "@/components/chat/AttachmentMenu";
import AttachmentPreview, { type Attachment } from "@/components/chat/AttachmentPreview";
import type { ResolvedLocation } from "@/lib/types";

type Phase = "idle" | "listening" | "thinking" | "speaking";

export interface VoiceTurn { role: "user" | "assistant"; text: string }

let _aid = 0;
const nextId = () => `va_${++_aid}`;

// Deepgram-friendly language codes; Haitian Creole isn't supported for STT so
// we let the provider auto-detect there rather than send an invalid code.
function sttLang(lang: string): string | undefined {
  return lang === "es" ? "es" : lang === "pt" ? "pt" : lang === "en" ? "en" : undefined;
}

export default function VoiceConversation({
  loc, radiusMiles, onTurn, onClose,
}: {
  loc: ResolvedLocation;
  radiusMiles: number;
  onTurn: (t: VoiceTurn) => void;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const [phase, setPhase] = useState<Phase>("idle");
  const [caption, setCaption] = useState("Tap the sphere to start talking");
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playingRef = useRef<HTMLAudioElement | null>(null);
  const stopSpeakRef = useRef<(() => void) | null>(null);
  const active = useRef(true);
  const mutedRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const cameraRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    active.current = true;
    const rec = recRef, ctx = audioCtx;
    return () => {
      active.current = false;
      try { rec.current?.stop(); } catch {}
      try { playingRef.current?.pause(); } catch {}
      ctx.current?.close().catch(() => {});
    };
  }, []);

  async function ensureCtx(): Promise<AudioContext> {
    if (!audioCtx.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx.current = new Ctx();
    }
    if (audioCtx.current.state === "suspended") { try { await audioCtx.current.resume(); } catch {} }
    return audioCtx.current;
  }

  // ── listen → transcribe → respond ──
  const startListening = useCallback(async () => {
    if (!active.current || mutedRef.current) return;
    setPhaseBoth("listening"); setCaption("Listening…");
    try {
      const ctx = await ensureCtx();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);
      analyserRef.current = analyser;

      const rec = new MediaRecorder(stream); recRef.current = rec; chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = async () => {
        analyserRef.current = null;
        try { src.disconnect(); } catch {}
        stream.getTracks().forEach((tk) => tk.stop());
        if (mutedRef.current) { setPhaseBoth("idle"); return; }         // muted mid-capture — drop it
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1200) { startListening(); return; }             // too short — keep listening
        await handleUtterance(blob);
      };
      rec.start();
      setTimeout(() => { try { rec.state === "recording" && rec.stop(); } catch {} }, 6000);
    } catch {
      setCaption("I couldn't reach your mic. Tap to try again.");
      setPhaseBoth("idle");
    }
  }, []);

  async function handleUtterance(blob: Blob) {
    setPhaseBoth("thinking"); setCaption("…");
    try {
      const headers: Record<string, string> = { "Content-Type": blob.type, ...(await authHeaders()) };
      const lc = sttLang(lang); if (lc) headers["x-crimeai-lang"] = lc;
      const tr = await fetch(apiUrl("/api/crimeai/voice/transcribe"), { method: "POST", headers, body: blob });
      const trData = await tr.json();
      if (!tr.ok || !trData.text) {
        if (trData.upsell) { setCaption("Voice is a Protector feature."); setPhaseBoth("idle"); return; }
        startListening(); return;
      }
      await respondTo(trData.text as string, true);
    } catch {
      setCaption("Something glitched. Tap to keep talking.");
      setPhaseBoth("idle");
    }
  }

  // Shared reply path for spoken OR typed input — keeps one conversation.
  async function respondTo(userText: string, continueAfter: boolean) {
    onTurn({ role: "user", text: userText });
    setCaption(`"${userText}"`);
    setPhaseBoth("thinking");
    try {
      const ask = await fetch(apiUrl("/api/crimeai/ask"), {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ question: userText, lat: loc.lat, lon: loc.lon, neighborhood: loc.neighborhood, address: loc.query, radiusMiles, days: 30 }),
      });
      const askData = await ask.json();
      const answer = (askData.answer || "Sorry, I didn't catch that.") as string;
      onTurn({ role: "assistant", text: answer });
      await speak(answer);
    } catch {
      setCaption("Network hiccup — tap to keep talking.");
    }
    if (continueAfter && active.current && !mutedRef.current) startListening();
    else setPhaseBoth("idle");
  }

  // A photo (camera / library) → describe it in the same conversation + speak.
  async function respondToImage(file: File, continueAfter: boolean) {
    let dataUrl: string;
    try { dataUrl = await resizeImage(file, 1024); } catch { return; }
    onTurn({ role: "user", text: "[Shared a photo]" });
    setPhaseBoth("thinking"); setCaption("Looking at your photo…");
    try {
      const res = await fetch(apiUrl("/api/crimeai/vision"), {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();
      const answer = res.ok ? (data.answer as string)
        : data.upsell ? "Reading images is a Protector feature." : (data.error || "I couldn't read that photo.");
      onTurn({ role: "assistant", text: answer });
      await speak(answer);
    } catch {
      setCaption("Couldn't analyze that photo.");
    }
    if (continueAfter && active.current && !mutedRef.current) startListening();
    else setPhaseBoth("idle");
  }

  async function speak(text: string) {
    setPhaseBoth("speaking"); setCaption(text);
    try {
      const res = await fetch(apiUrl("/api/crimeai/voice/speak"), {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        await res.json().catch(() => ({}));
        setCaption(res.status === 402
          ? "Voice replies are a Protector feature."
          : "My voice isn't switched on here yet — I'll keep answering in text.");
        await pause(1500);
        return;
      }
      const buf = await res.arrayBuffer();
      if (!buf.byteLength) return;
      const url = URL.createObjectURL(new Blob([buf], { type: res.headers.get("Content-Type") || "audio/mpeg" }));
      await playWithWave(url);
      URL.revokeObjectURL(url);
    } catch { /* non-fatal */ }
  }

  async function playWithWave(url: string) {
    const audio = new Audio(url); audio.preload = "auto"; playingRef.current = audio;
    try {
      const ctx = await ensureCtx();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser); analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      await new Promise<void>((resolve) => {
        stopSpeakRef.current = () => { try { audio.pause(); } catch {}; resolve(); };
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
      analyserRef.current = null;
      try { source.disconnect(); analyser.disconnect(); } catch {}
    } catch {
      try { await audio.play(); await new Promise<void>((r) => { stopSpeakRef.current = () => { try { audio.pause(); } catch {}; r(); }; audio.onended = () => r(); audio.onerror = () => r(); }); } catch {}
      analyserRef.current = null;
    } finally {
      stopSpeakRef.current = null; playingRef.current = null;
    }
  }

  function pause(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

  // Tap the sphere: start when idle; interrupt (barge-in) when CrimeAI is
  // speaking; stop early when listening.
  function onSphereTap() {
    if (phase === "idle") startListening();
    else if (phase === "speaking") { stopSpeakRef.current?.(); startListening(); }
    else if (phase === "listening") { try { recRef.current?.stop(); } catch {} }
  }

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next; setMuted(next);
    if (next) {
      try { recRef.current?.stop(); } catch {}
      setPhaseBoth("idle"); setCaption("Muted — tap the mic to talk again");
    } else {
      startListening();
    }
  }

  // ── composer (type or attach in voice mode) ──
  function onPicked(file: File | undefined) {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      resizeImage(file, 512).then((thumb) =>
        setAttachments((a) => [...a, { id: nextId(), kind: "image", name: file.name || "photo", dataUrl: thumb, file }])
      ).catch(() => setAttachments((a) => [...a, { id: nextId(), kind: "image", name: file.name || "photo", file }]));
    } // Files that aren't images: vision is image-only today — ignore silently to avoid a dead attachment.
  }

  async function sendComposer() {
    const imgs = attachments.filter((a) => a.kind === "image");
    const text = input.trim();
    setAttachments([]); setInput("");
    for (const a of imgs) await respondToImage(a.file, false);
    if (text) await respondTo(text, false);
  }

  const canSend = (input.trim().length > 0 || attachments.length > 0) && phase !== "thinking";
  const statusWord = phase === "listening" ? "Listening" : phase === "thinking" ? "Thinking"
    : phase === "speaking" ? "Speaking" : muted ? "Muted" : "Tap the sphere to talk";

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-shell pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      {/* header — minimal identity, NO settings/selectors */}
      <div className="flex items-center justify-center px-6">
        <div className="flex items-center gap-2">
          <svg width="20" height="23" viewBox="0 0 24 28" className="text-brand" fill="currentColor" aria-hidden="true">
            <path d="M12 1L3 4.5v7.5c0 5.4 3.8 10.5 9 12.4 5.2-1.9 9-7 9-12.4V4.5L12 1z" opacity="0.25" />
            <path d="M12 2.6L4.4 5.5v6.5c0 4.6 3.2 9 7.6 10.6 4.4-1.6 7.6-6 7.6-10.6V5.5L12 2.6z" fill="none" stroke="currentColor" strokeWidth="0.7" />
          </svg>
          <span className="text-sm font-bold text-ink">Talk to CrimeAI</span>
        </div>
      </div>

      {/* center — the living red particle sphere */}
      <button onClick={onSphereTap} aria-label="CrimeAI voice sphere — tap to talk or interrupt"
        className="relative flex flex-1 items-center justify-center px-6 outline-none">
        <div className="aspect-square w-full max-w-[72vw] sm:max-w-sm">
          <CrimeAIVoiceSphere analyser={analyserRef} phase={phase} />
        </div>
      </button>

      {/* status line */}
      <p className="mb-3 min-h-[20px] px-8 text-center text-[13px] text-ink2 line-clamp-2">
        {phase === "idle" && !muted ? caption : statusWord}
      </p>

      {/* bottom controls: [ + | Ask CrimeAI ]  [ mic ]  [ ✕ ] */}
      <div className="px-4">
        <div className="mx-auto max-w-md">
          <AttachmentPreview items={attachments} onRemove={(id) => setAttachments((a) => a.filter((x) => x.id !== id))} />
          <div className="flex items-end gap-2">
            {/* hidden pickers */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onPicked(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={photosRef} type="file" accept="image/*" hidden onChange={(e) => { onPicked(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={filesRef} type="file" accept="image/*" hidden onChange={(e) => { onPicked(e.target.files?.[0]); e.target.value = ""; }} />

            {/* composer pill with + attachment menu */}
            <div className="relative flex flex-1 items-center gap-1 rounded-full border border-ink/10 bg-card px-1.5 py-1">
              <div className="relative shrink-0">
                <AttachmentMenu open={menuOpen} onClose={() => setMenuOpen(false)}
                  onCamera={() => cameraRef.current?.click()} onPhotos={() => photosRef.current?.click()} onFiles={() => filesRef.current?.click()} />
                <button onClick={() => setMenuOpen((v) => !v)} aria-label="Add attachment" aria-expanded={menuOpen}
                  className={`grid h-9 w-9 place-items-center rounded-full text-ink2 transition active:scale-95 ${menuOpen ? "rotate-45 bg-ink/10" : ""}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
              <input value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSend) { e.preventDefault(); sendComposer(); } }}
                placeholder="Ask CrimeAI" aria-label="Ask CrimeAI text input"
                className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[15px] outline-none placeholder:text-ink3" />
              {canSend && (
                <button onClick={sendComposer} aria-label="Send" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white active:scale-95">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                </button>
              )}
            </div>

            {/* mic mute/unmute — distinguished by more than colour (slash + border + label state) */}
            <button onClick={toggleMute} aria-label={muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={muted}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border transition active:scale-95 ${muted ? "border-ink/20 bg-ink/10 text-ink3" : "border-transparent bg-brand text-white"}`}>
              {muted ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 9v3a3 3 0 004.9 2.3M15 12V5a3 3 0 00-5.9-.8M5 10v1a7 7 0 0010.7 6M12 19v3M2 2l20 20" /></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10v1a7 7 0 0014 0v-1M12 18v4M8 22h8" /></svg>
              )}
            </button>

            {/* exit */}
            <button onClick={onClose} aria-label="End voice conversation"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-ink/10 bg-card text-ink2 active:scale-95">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
