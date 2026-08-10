"use client";

// Full-screen voice conversation with CrimeAI — the ChatGPT-style voice mode.
//
// A shield-shaped visual pulses and glows in sync with CrimeAI's actual voice
// (driven by a Web Audio analyser on the TTS playback), and with your voice
// while you speak. Each turn (yours + CrimeAI's) is handed back to the text
// thread via onTurn, so closing voice mode leaves the whole conversation
// transcribed in the normal chat.
//
// Protector-only; the caller only mounts this for isPro. Everything degrades
// gracefully — a failed transcribe/speak returns you to listening, never a
// dead end.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, authHeaders } from "@/lib/api";
import type { ResolvedLocation } from "@/lib/types";

type Phase = "idle" | "listening" | "thinking" | "speaking";

export interface VoiceTurn { role: "user" | "assistant"; text: string }

export default function VoiceConversation({
  loc, radiusMiles, onTurn, onClose,
}: {
  loc: ResolvedLocation;
  radiusMiles: number;
  onTurn: (t: VoiceTurn) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [caption, setCaption] = useState("Tap the shield to start talking");
  const [amp, setAmp] = useState(0); // 0..1 amplitude driving the shield

  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const active = useRef(true);

  useEffect(() => () => { active.current = false; stopAmpLoop(); recRef.current?.stop(); audioCtx.current?.close().catch(() => {}); }, []);

  function stopAmpLoop() { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; }

  // Drive `amp` from an analyser node (used for both mic input and TTS output).
  function runAmpLoop(analyser: AnalyserNode) {
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      setAmp(Math.min(1, Math.sqrt(sum / buf.length) * 3));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  // ── listen: record until silence-ish (a fixed max), then transcribe ──
  const startListening = useCallback(async () => {
    if (!active.current) return;
    setPhase("listening"); setCaption("Listening…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext(); audioCtx.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512; src.connect(analyser);
      runAmpLoop(analyser);

      const rec = new MediaRecorder(stream); recRef.current = rec; chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = async () => {
        stopAmpLoop(); setAmp(0);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1200) { startListening(); return; } // too short — keep listening
        await handleUtterance(blob);
      };
      rec.start();
      // Give them a window to speak; they can also tap to stop early.
      setTimeout(() => { try { rec.state === "recording" && rec.stop(); } catch {} }, 6000);
    } catch {
      setCaption("I couldn't reach your mic. Tap to try again.");
      setPhase("idle");
    }
  }, []);

  async function handleUtterance(blob: Blob) {
    setPhase("thinking"); setCaption("…");
    try {
      // 1) transcribe
      const tr = await fetch(apiUrl("/api/crimeai/voice/transcribe"), {
        method: "POST", headers: { "Content-Type": blob.type, ...(await authHeaders()) }, body: blob,
      });
      const trData = await tr.json();
      if (!tr.ok || !trData.text) {
        if (trData.upsell) { setCaption("Voice is a Protector feature."); setPhase("idle"); return; }
        startListening(); return; // couldn't hear — listen again
      }
      const userText = trData.text as string;
      onTurn({ role: "user", text: userText });
      setCaption(`"${userText}"`);

      // 2) answer (same grounded ask the text chat uses)
      const ask = await fetch(apiUrl("/api/crimeai/ask"), {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ question: userText, lat: loc.lat, lon: loc.lon, neighborhood: loc.neighborhood, address: loc.query, radiusMiles, days: 30 }),
      });
      const askData = await ask.json();
      const answer = (askData.answer || "Sorry, I didn't catch that.") as string;
      onTurn({ role: "assistant", text: answer });

      // 3) speak it, animating the shield from the audio
      await speak(answer);
      if (active.current) startListening(); // continue the conversation
    } catch {
      setCaption("Something glitched. Tap to keep talking.");
      setPhase("idle");
    }
  }

  async function speak(text: string) {
    setPhase("speaking"); setCaption(text);
    try {
      const res = await fetch(apiUrl("/api/crimeai/voice/speak"), {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const ctx = new AudioContext(); audioCtx.current = ctx;
      const source = ctx.createBufferSource();
      source.buffer = await ctx.decodeAudioData(buf);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      source.connect(analyser); analyser.connect(ctx.destination);
      runAmpLoop(analyser);
      await new Promise<void>((resolve) => { source.onended = () => resolve(); source.start(); });
      stopAmpLoop(); setAmp(0);
      ctx.close().catch(() => {});
    } catch { /* playback failed — non-fatal, fall through to listen */ }
  }

  function onShieldTap() {
    if (phase === "idle") startListening();
    else if (phase === "listening") { try { recRef.current?.stop(); } catch {} } // stop early
  }

  const scale = 1 + amp * 0.25;
  const glow = 0.25 + amp * 0.55;

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-between bg-shell px-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="flex w-full items-center justify-between">
        <span className="text-sm font-semibold text-ink2">Talking with CrimeAI</span>
        <button onClick={onClose} className="text-sm font-semibold text-ink2">Done</button>
      </div>

      {/* the living shield */}
      <button onClick={onShieldTap} className="relative grid place-items-center" aria-label="Shield">
        <div className="absolute rounded-full bg-brand blur-3xl transition-all"
          style={{ width: 220, height: 220, opacity: glow, transform: `scale(${scale})` }} />
        <svg width="150" height="176" viewBox="0 0 24 28" className="relative text-brand transition-transform"
          style={{ transform: `scale(${scale})` }} fill="currentColor">
          <path d="M12 0L1 4v9c0 6.6 4.7 12.8 11 14.9C18.3 25.8 23 19.6 23 13V4L12 0z" opacity="0.18" />
          <path d="M12 2.2L3 5.5v7.5c0 5.4 3.8 10.5 9 12.4 5.2-1.9 9-7 9-12.4V5.5L12 2.2z" fill="none" stroke="currentColor" strokeWidth="0.6" />
          <path d="M9.5 13.5l1.8 1.8 3.5-3.8" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="min-h-[72px] max-w-md text-center">
        <p className="text-[15px] leading-relaxed text-ink2">{caption}</p>
        <p className="mt-3 text-[11px] uppercase tracking-wide text-ink3">
          {phase === "listening" ? "Listening — tap to send" : phase === "thinking" ? "Thinking" : phase === "speaking" ? "Speaking" : "Tap the shield to talk"}
        </p>
      </div>
    </div>
  );
}
