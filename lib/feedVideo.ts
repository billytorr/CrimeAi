"use client";

// ── Feed video controller (TikTok / Instagram-style) ────────────────
// One shared brain for every <video> in the feed:
//   • only the MOST-visible video plays at a time (others pause)
//   • a single global mute state, muted by default (browsers block
//     unmuted autoplay until a user gesture) — tapping unmute on any
//     video turns sound on for it AND every video that plays after,
//     exactly like IG/TikTok
//   • when the active video is unmuted we retry play() and fall back to
//     muted only if the browser refuses
//
// Videos register themselves and report their visible ratio (fed by an
// IntersectionObserver); the controller debounces to an animation frame
// and picks the winner.

let muted = true;
const muteListeners = new Set<(m: boolean) => void>();
export const isMuted = () => muted;
export function setMuted(m: boolean) {
  if (m === muted) return;
  muted = m;
  if (active) {
    active.muted = m;
    if (!m) active.play().catch(() => {}); // unmute is a user gesture → allowed
  }
  muteListeners.forEach((l) => l(muted));
}
export function onMuteChange(l: (m: boolean) => void) {
  muteListeners.add(l);
  return () => muteListeners.delete(l);
}

const ratios = new Map<HTMLVideoElement, number>();
let active: HTMLVideoElement | null = null;
let frame = 0;

export function registerVideo(el: HTMLVideoElement) {
  ratios.set(el, 0);
  schedule();
  return () => {
    ratios.delete(el);
    if (active === el) { active.pause?.(); active = null; }
    schedule();
  };
}

export function reportRatio(el: HTMLVideoElement, ratio: number) {
  ratios.set(el, ratio);
  schedule();
}

function schedule() {
  if (frame || typeof requestAnimationFrame === "undefined") return;
  frame = requestAnimationFrame(() => { frame = 0; pick(); });
}

function safePlay(el: HTMLVideoElement) {
  el.muted = muted;
  el.play().catch(() => {
    // browser refused unmuted autoplay → play muted so it still moves,
    // and revert the global state so the UI honestly shows "muted"
    // (the user taps once more to grant sound)
    if (!el.muted) {
      el.muted = true;
      muted = true;
      muteListeners.forEach((l) => l(true));
      el.play().catch(() => {});
    }
  });
}

function pick() {
  // winner must be at least half on screen; hysteresis avoids flip-flop
  let best: HTMLVideoElement | null = null;
  let bestRatio = 0.5;
  for (const [el, r] of ratios) {
    if (r > bestRatio) { bestRatio = r; best = el; }
  }

  if (best === active) {
    if (best && best.paused) safePlay(best);
    return;
  }
  if (active) active.pause();
  active = best;
  if (best) safePlay(best);
}
