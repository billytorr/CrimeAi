"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/auth";
import { Alert, Walk, Phone } from "@/components/Icons";

// Floating red SOS button (used on Map / Ask / Inbox).
// Draggable: press and move to park it anywhere on screen so it never
// blocks content; a tap (no movement) still opens the safety sheet.
// The chosen spot is remembered on this device.
const SOS_POS_KEY = "pscc_sos_pos";
const FAB = 52; // button diameter

export function SosFab({ onClick }: { onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); // null = default corner
  const posRef = useRef<{ x: number; y: number } | null>(null); // latest position, immune to render timing
  const drag = useRef({ active: false, moved: false, dx: 0, dy: 0 });

  const clamp = (p: { x: number; y: number }) => {
    const parent = ref.current?.offsetParent as HTMLElement | null;
    if (!parent) return p;
    return {
      x: Math.min(Math.max(4, p.x), parent.clientWidth - FAB - 4),
      y: Math.min(Math.max(8, p.y), parent.clientHeight - FAB - 8),
    };
  };

  useEffect(() => {
    try {
      const s = localStorage.getItem(SOS_POS_KEY);
      if (s) { const p = clamp(JSON.parse(s)); posRef.current = p; setPos(p); }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { active: true, moved: false, dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { el.setPointerCapture(e.pointerId); } catch {}
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return;
    const parent = ref.current?.offsetParent as HTMLElement | null;
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const next = clamp({ x: e.clientX - pr.left - drag.current.dx, y: e.clientY - pr.top - drag.current.dy });
    if (!drag.current.moved) {
      // small movements are a tap, not a drag
      const cur = ref.current!.getBoundingClientRect();
      const dist = Math.abs(e.clientX - (cur.left + drag.current.dx)) + Math.abs(e.clientY - (cur.top + drag.current.dy));
      if (dist < 6) return;
      drag.current.moved = true;
    }
    posRef.current = next;
    setPos(next);
  }
  function onPointerUp() {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (drag.current.moved && posRef.current) {
      try { localStorage.setItem(SOS_POS_KEY, JSON.stringify(posRef.current)); } catch {}
    }
    // click fires right after pointerup — clear the flag on the next tick
    setTimeout(() => { drag.current.moved = false; }, 0);
  }

  return (
    <button
      ref={ref}
      onClick={() => { if (!drag.current.moved) onClick(); }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="pulse absolute z-[1050] grid cursor-grab place-items-center rounded-full bg-signal-red text-ink shadow-lg [touch-action:none] active:scale-95"
      style={{ height: FAB, width: FAB, ...(pos ? { left: pos.x, top: pos.y } : { bottom: 120, left: 16 }) }}
      aria-label="Emergency — tap to open, drag to move"
    >
      <span className="text-sm font-bold">SOS</span>
    </button>
  );
}

// Compact SOS pill (used in the Feed header so it never covers a reel).
export function SosPill({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="pulse grid h-9 w-9 place-items-center rounded-full bg-signal-red text-[11px] font-bold text-ink active:scale-95" aria-label="Emergency">
      SOS
    </button>
  );
}

// Controlled emergency sheets (rendered once by AppShell).
export default function SosSheets({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const [mode, setMode] = useState<null | "safe" | "walk">(null);
  if (!open) return null;

  const close = () => { setMode(null); onClose(); };

  if (mode === "safe") return <NotSafe profile={profile} onClose={close} onBack={() => setMode(null)} />;
  if (mode === "walk") return <WalkWithMe profile={profile} onClose={close} onBack={() => setMode(null)} />;

  return (
    <Sheet title="Safety" onClose={close}>
      <div className="space-y-3">
        <button onClick={() => setMode("safe")} className="flex w-full items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-left active:scale-[0.99]">
          <span className="text-red-300"><Alert size={26} /></span>
          <div><div className="font-semibold text-red-200">I&apos;m not safe</div><div className="text-xs text-red-300/80">Share my location + context with my circle</div></div>
        </button>
        <button onClick={() => setMode("walk")} className="flex w-full items-center gap-3 rounded-2xl border border-brand/30 bg-brand/10 p-4 text-left active:scale-[0.99]">
          <span className="text-brand"><Walk size={26} /></span>
          <div><div className="font-semibold text-brand">Walk with me</div><div className="text-xs text-brand/80">Live location share until I&apos;m home safe</div></div>
        </button>
        <a href="tel:911" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-signal-red p-4 font-semibold text-ink active:scale-[0.99]"><Phone size={18} /> Call 911</a>
      </div>
    </Sheet>
  );
}

function Sheet({ children, title, onClose, onBack }: { children: React.ReactNode; title: string; onClose: () => void; onBack?: () => void }) {
  return (
    <div className="absolute inset-0 z-[1200] flex flex-col justify-end fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="sheet-in safe-bottom relative rounded-t-3xl border-t border-ink/10 bg-card px-5 pb-6 pt-3" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/20" />
        <div className="mb-4 flex items-center justify-between">
          {onBack ? <button onClick={onBack} className="text-sm text-ink2">← Back</button> : <span />}
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-sm text-ink2">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NotSafe({ profile, onClose, onBack }: { profile: Profile; onClose: () => void; onBack: () => void }) {
  const [sent, setSent] = useState(false);
  const circle = profile.contacts.length;
  return (
    <Sheet title="I'm not safe" onClose={onClose} onBack={onBack}>
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
        If this is a true emergency, <b>call 911 now</b>. This notifies your trusted contacts — it does not contact police for you.
      </div>
      {!sent ? (
        <>
          <div className="mt-4 rounded-xl border border-ink/10 bg-shell p-3 text-xs text-ink2">
            <Row k="Location" v={`${profile.location.neighborhood}, Miami, FL`} />
            <Row k="Coordinates" v={`${profile.location.lat.toFixed(4)}, ${profile.location.lon.toFixed(4)}`} />
            <Row k="Time" v={new Date().toLocaleTimeString()} />
            <Row k="Circle" v={circle ? `${circle} contact${circle > 1 ? "s" : ""}` : "none added yet"} />
          </div>
          <div className="mt-4 flex gap-2">
            <a href="tel:911" className="flex-1 rounded-xl bg-signal-red py-3 text-center text-sm font-semibold text-ink">Call 911</a>
            <button onClick={() => setSent(true)} className="flex-1 rounded-xl border border-ink/15 bg-ink/5 py-3 text-sm font-semibold text-ink">Notify my circle</button>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-brand/30 bg-brand/10 p-4 text-sm text-brand">✓ Your trusted circle was notified with your live location and context.</div>
      )}
    </Sheet>
  );
}

function WalkWithMe({ profile, onClose, onBack }: { profile: Profile; onClose: () => void; onBack: () => void }) {
  const [active, setActive] = useState(false);
  const [secs, setSecs] = useState(15 * 60);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [active]);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <Sheet title="Walk with me" onClose={onClose} onBack={onBack}>
      {!active ? (
        <>
          <p className="text-sm text-ink2">Share your live location with a trusted contact until you arrive safely. Auto-stops when you confirm you're home.</p>
          <button onClick={() => setActive(true)} className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white">Start 15-minute session</button>
        </>
      ) : (
        <>
          <div className="py-2 text-center">
            <div className="text-5xl font-bold tabular-nums text-brand">{mm}:{ss}</div>
            <p className="mt-2 text-xs text-ink2">Sharing your live location near {profile.location.neighborhood} with your trusted circle.</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={onClose} className="rounded-xl bg-brand py-3 text-sm font-semibold text-white">✓ I'm home safe</button>
            <button onClick={() => setActive(false)} className="rounded-xl border border-ink/15 bg-ink/5 py-3 text-sm font-semibold text-ink">Pause</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-0.5"><span className="text-ink3">{k}</span><span className="text-ink2">{v}</span></div>;
}
