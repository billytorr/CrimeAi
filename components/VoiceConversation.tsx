"use client";

// Full-screen voice conversation with CrimeAI — the ChatGPT-style voice mode.
//
// The centrepiece is a live red "digital waveform": a canvas equalizer driven
// by a Web Audio AnalyserNode on CrimeAI's ACTUAL voice while it speaks (and on
// your voice while you talk). It moves to the real audio — not a canned video —
// so it always matches what's being said. Futuristic, calm, safe to talk to.
//
// Each turn (yours + CrimeAI's) is handed back to the text thread via onTurn,
// so closing voice mode leaves the whole conversation transcribed in chat.
//
// Protector-only; the caller only mounts this for isPro. Everything degrades
// gracefully — a failed transcribe/speak returns you to listening, and if
// CrimeAI's voice isn't switched on we SAY so (instead of going silent) and
// keep the answer in text.

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
  const [caption, setCaption] = useState("Tap the waveform to start talking");

  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null); // whichever source is live
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const active = useRef(true);
  const phaseRef = useRef<Phase>("idle");
  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    active.current = true; // re-arm (StrictMode dev mounts twice)
    const rec = recRef, ctx = audioCtx;
    return () => {
      active.current = false;
      rec.current?.stop();
      ctx.current?.close().catch(() => {});
    };
  }, []);

  // One AudioContext for the whole session, unlocked on the first user gesture
  // (tap). iOS/Safari start it suspended and only a gesture-driven resume lets
  // audio play — the old code created a fresh, suspended context per turn, which
  // is a common "answered in text but no sound" cause.
  async function ensureCtx(): Promise<AudioContext> {
    if (!audioCtx.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx.current = new Ctx();
    }
    if (audioCtx.current.state === "suspended") { try { await audioCtx.current.resume(); } catch {} }
    return audioCtx.current;
  }

  // ── the living waveform ──────────────────────────────────────────
  // One persistent RAF loop draws whatever analyser is currently live
  // (mic while listening, TTS while speaking) and a gentle idle shimmer
  // otherwise, so the visual always feels alive.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const BARS = 44;
    const freq = new Uint8Array(1024);
    let t = 0;
    let sizedW = 0, sizedH = 0;
    let raf = 0;
    let stopped = false;

    const draw = () => {
      if (stopped) return;
      t += 1;
      // Size from live client dimensions each frame — robust to mount timing,
      // StrictMode double-mount, and resizes. Re-scale only when it changes.
      const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
      if (!cssW || !cssH) { raf = requestAnimationFrame(draw); return; }
      if (cssW !== sizedW || cssH !== sizedH) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        sizedW = cssW; sizedH = cssH;
      }
      ctx2d.clearRect(0, 0, cssW, cssH);
      const midY = cssH / 2;
      const gap = 4;
      const barW = (cssW - gap * (BARS - 1)) / BARS;

      const an = analyserRef.current;
      let bins: Uint8Array | null = null;
      if (an) { an.getByteFrequencyData(freq); bins = freq; }
      const speaking = phaseRef.current === "speaking";
      const listening = phaseRef.current === "listening";

      for (let i = 0; i < BARS; i++) {
        let level: number;
        if (bins) {
          // sample the low-mid band (where speech energy lives), mirrored
          const idx = Math.floor((i / BARS) * 120) + 2;
          level = bins[idx] / 255;
        } else {
          level = 0; // idle
        }
        // idle / floor shimmer so it always breathes and feels safe
        const idle = 0.10 + 0.06 * Math.sin(i * 0.5 + t * 0.08) + 0.04 * Math.sin(t * 0.05);
        const h = Math.max(idle, level * 0.92) * (cssH * 0.9);
        const x = i * (barW + gap);
        const y = midY - h / 2;

        const grad = ctx2d.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, "rgba(255,90,96,0.95)");
        grad.addColorStop(0.5, "rgba(233,42,52,1)");
        grad.addColorStop(1, "rgba(160,20,26,0.95)");
        ctx2d.fillStyle = grad;
        ctx2d.shadowColor = "rgba(233,42,52,0.85)";
        ctx2d.shadowBlur = speaking ? 18 : listening ? 12 : 7;

        const r = Math.min(barW / 2, 4);
        roundRect(ctx2d, x, y, barW, h, r);
        ctx2d.fill();
      }
      ctx2d.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { stopped = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ── listen: record a window, then transcribe ──
  const startListening = useCallback(async () => {
    if (!active.current) return;
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
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1200) { startListening(); return; } // too short — keep listening
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
      const tr = await fetch(apiUrl("/api/crimeai/voice/transcribe"), {
        method: "POST", headers: { "Content-Type": blob.type, ...(await authHeaders()) }, body: blob,
      });
      const trData = await tr.json();
      if (!tr.ok || !trData.text) {
        if (trData.upsell) { setCaption("Voice is a Protector feature."); setPhaseBoth("idle"); return; }
        startListening(); return; // couldn't hear — listen again
      }
      const userText = trData.text as string;
      onTurn({ role: "user", text: userText });
      setCaption(`"${userText}"`);

      const ask = await fetch(apiUrl("/api/crimeai/ask"), {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ question: userText, lat: loc.lat, lon: loc.lon, neighborhood: loc.neighborhood, address: loc.query, radiusMiles, days: 30 }),
      });
      const askData = await ask.json();
      const answer = (askData.answer || "Sorry, I didn't catch that.") as string;
      onTurn({ role: "assistant", text: answer });

      await speak(answer);
      if (active.current) startListening(); // continue the conversation
    } catch {
      setCaption("Something glitched. Tap to keep talking.");
      setPhaseBoth("idle");
    }
  }

  async function speak(text: string) {
    setPhaseBoth("speaking"); setCaption(text);
    try {
      const res = await fetch(apiUrl("/api/crimeai/voice/speak"), {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        // Surface WHY there's no voice instead of going silent. 402 = plan,
        // 503 = TTS key not configured in this environment.
        await res.json().catch(() => ({}));
        setCaption(res.status === 402
          ? "Voice replies are a Protector feature."
          : "My voice isn't switched on here yet — I'll keep answering in text. (Add the ElevenLabs key to enable spoken replies.)");
        await pause(1600);
        return;
      }
      const buf = await res.arrayBuffer();
      if (!buf.byteLength) return;
      const url = URL.createObjectURL(new Blob([buf], { type: res.headers.get("Content-Type") || "audio/mpeg" }));
      await playWithWave(url);
      URL.revokeObjectURL(url);
    } catch {
      // playback failed — non-fatal, fall through to listen
    }
  }

  // Play the MP3 through the AudioContext so the analyser (and thus the
  // waveform) reacts to CrimeAI's real voice. Falls back to a plain <audio>
  // element if the graph can't be built, so sound is never lost.
  async function playWithWave(url: string) {
    const audio = new Audio(url);
    audio.preload = "auto";
    try {
      const ctx = await ensureCtx();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser); analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      await audio.play();
      await new Promise<void>((resolve) => { audio.onended = () => resolve(); audio.onerror = () => resolve(); });
      analyserRef.current = null;
      try { source.disconnect(); analyser.disconnect(); } catch {}
    } catch {
      // Web Audio graph failed — at least play the sound directly.
      try { await audio.play(); await new Promise<void>((r) => { audio.onended = () => r(); audio.onerror = () => r(); }); } catch {}
      analyserRef.current = null;
    }
  }

  function pause(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

  function onTap() {
    if (phase === "idle") startListening();
    else if (phase === "listening") { try { recRef.current?.stop(); } catch {} } // stop early
  }

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-between bg-shell px-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="flex w-full items-center justify-between">
        <span className="text-sm font-semibold text-ink2">Talking with CrimeAI</span>
        <button onClick={onClose} className="text-sm font-semibold text-ink2">Done</button>
      </div>

      {/* the living red waveform */}
      <button onClick={onTap} className="relative grid w-full max-w-md place-items-center py-8" aria-label="Waveform — tap to talk">
        <div className="pointer-events-none absolute h-40 w-40 rounded-full bg-brand/25 blur-3xl" />
        <canvas ref={canvasRef} className="relative h-40 w-full" />
      </button>

      <div className="min-h-[72px] max-w-md text-center">
        <p className="text-[15px] leading-relaxed text-ink2">{caption}</p>
        <p className="mt-3 text-[11px] uppercase tracking-wide text-ink3">
          {phase === "listening" ? "Listening — tap to send" : phase === "thinking" ? "Thinking" : phase === "speaking" ? "Speaking" : "Tap the waveform to talk"}
        </p>
      </div>
    </div>
  );
}
