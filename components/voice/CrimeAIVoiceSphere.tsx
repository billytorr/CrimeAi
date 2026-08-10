"use client";

// CrimeAIVoiceSphere — the living intelligence core for Talk-to-CrimeAI.
//
// A genuine pseudo-3D sphere built from ~900 red digital particles laid out on
// a Fibonacci sphere, rotated and perspective-projected every frame, depth-
// sorted and depth-shaded so it reads as a volume, not a flat disk. It reacts
// to real audio: pass the live AnalyserNode (CrimeAI's TTS while speaking, or
// the mic while listening) and the particles displace to the actual sound.
//
// Pure Canvas2D + requestAnimationFrame — no graphics dependency. Colours come
// from the CrimeAI brand token (--c-brand). Respects prefers-reduced-motion.

import { useEffect, useRef } from "react";

export type SpherePhase = "idle" | "listening" | "thinking" | "speaking";

// Read the canonical CrimeAI red from the CSS token so we never hard-code a hex.
function brandRGB(): [number, number, number] {
  if (typeof window === "undefined") return [233, 42, 52];
  const v = getComputedStyle(document.documentElement).getPropertyValue("--c-brand").trim();
  const parts = v.split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
  return parts.length === 3 ? [parts[0], parts[1], parts[2]] : [233, 42, 52];
}

interface Pt { x: number; y: number; z: number; ph: number }

// Even points on a unit sphere (Fibonacci lattice) — stable, no clumping.
function makeSphere(n: number): Pt[] {
  const pts: Pt[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * golden;
    pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, ph: (i * 9301 % 233280) / 233280 });
  }
  return pts;
}

export default function CrimeAIVoiceSphere({
  analyser, phase,
}: {
  analyser: React.MutableRefObject<AnalyserNode | null>;
  phase: SpherePhase;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<SpherePhase>(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const [br, bg, bb] = brandRGB();

    let pts: Pt[] = [];
    let sizedW = 0, sizedH = 0;
    let ay = 0, ax = 0;
    let amp = 0;          // smoothed overall amplitude 0..1
    let bass = 0, high = 0;
    let raf = 0, stopped = false;
    const time = { t: 0 };
    const td = new Uint8Array(2048);
    const fd = new Uint8Array(1024);

    const readAudio = () => {
      const an = analyser.current;
      if (!an) { amp += (0 - amp) * 0.08; bass += (0 - bass) * 0.08; high += (0 - high) * 0.08; return; }
      an.getByteTimeDomainData(td);
      let sum = 0;
      for (let i = 0; i < td.length; i++) { const v = (td[i] - 128) / 128; sum += v * v; }
      const rms = Math.min(1, Math.sqrt(sum / td.length) * 3.2);
      an.getByteFrequencyData(fd);
      let b = 0, h = 0;
      for (let i = 2; i < 40; i++) b += fd[i];
      for (let i = 300; i < 460; i++) h += fd[i];
      const bN = Math.min(1, b / (38 * 210)), hN = Math.min(1, h / (160 * 150));
      // smooth so it feels sophisticated, not jittery
      amp += (rms - amp) * 0.22;
      bass += (bN - bass) * 0.18;
      high += (hN - high) * 0.2;
    };

    const draw = () => {
      if (stopped) return;
      time.t += 1;
      const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
      if (!cssW || !cssH) { raf = requestAnimationFrame(draw); return; }
      if (cssW !== sizedW || cssH !== sizedH) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sizedW = cssW; sizedH = cssH;
        const N = Math.max(520, Math.min(1000, Math.floor((cssW * cssH) / 360)));
        pts = makeSphere(N);
      }

      readAudio();
      ctx.clearRect(0, 0, cssW, cssH);

      const cx = cssW / 2, cy = cssH / 2;
      const R = Math.min(cssW, cssH) * 0.34;
      const speaking = phaseRef.current === "speaking";
      const listening = phaseRef.current === "listening";
      const thinking = phaseRef.current === "thinking";

      // breathing + rotation (reduced-motion tones both down)
      const breathe = 1 + 0.03 * Math.sin(time.t * 0.03) + amp * (speaking ? 0.14 : 0.05);
      const S = R * breathe;
      const rotSpeed = (reduce ? 0.0006 : 0.0022) + (thinking ? 0.0016 : 0) + amp * 0.001;
      ay += rotSpeed;
      ax = 0.28 + Math.sin(time.t * 0.006) * (reduce ? 0.02 : 0.06);
      const focal = 2.7;
      const cosY = Math.cos(ay), sinY = Math.sin(ay), cosX = Math.cos(ax), sinX = Math.sin(ax);
      const dispA = (reduce ? 0.4 : 1) * (speaking ? 1 : listening ? 0.5 : 0.32);

      // soft red core glow, intensity tracks audio
      const glowR = S * 1.35;
      const grd = ctx.createRadialGradient(cx, cy, S * 0.1, cx, cy, glowR);
      const gi = 0.12 + amp * (speaking ? 0.4 : 0.18);
      grd.addColorStop(0, `rgba(${br},${bg},${bb},${gi})`);
      grd.addColorStop(1, `rgba(${br},${bg},${bb},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill();

      // project every particle, then depth-sort back→front
      const proj: { sx: number; sy: number; d: number; sz: number }[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        // rotate Y then X
        const x1 = p.x * cosY + p.z * sinY;
        const z1 = -p.x * sinY + p.z * cosY;
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;
        // per-particle surface wave from audio (bass = broad swell, high = shimmer)
        const wave = dispA * (0.06 * Math.sin(time.t * 0.05 + p.ph * 6.283)
          + bass * 0.12 * Math.sin(p.y * 3 + time.t * 0.04)
          + high * 0.05 * Math.sin(p.ph * 40 + time.t * 0.12));
        const disp = 1 + amp * 0.16 * dispA + wave;
        const X = x1 * disp, Y = y2 * disp, Z = z2 * disp;
        const persp = focal / (focal - Z);
        proj.push({ sx: cx + X * S * persp, sy: cy + Y * S * persp, d: (Z + 1) / 2, sz: persp });
      }
      proj.sort((a, b) => a.d - b.d);

      for (let i = 0; i < proj.length; i++) {
        const q = proj[i];
        const depth = q.d;                       // 0 back .. 1 front
        const size = (0.5 + depth * 2.0) * q.sz;
        const bright = 0.3 + depth * 0.7;
        const r = Math.round(br * bright + (255 - br) * depth * 0.35 + amp * 30 * depth);
        const g = Math.round(bg * bright + amp * 22 * depth);
        const b = Math.round(bb * bright + amp * 22 * depth);
        ctx.globalAlpha = 0.2 + depth * 0.8;
        ctx.fillStyle = `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
        ctx.beginPath(); ctx.arc(q.sx, q.sy, Math.max(0.4, size), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => { stopped = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
