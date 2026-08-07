"use client";

// Biometric app lock.
//
// ⚠️ RULE 1 — SAFETY IS NOT BEHIND THE LOCK. The lock screen renders a live
// SOS control that works without unlocking. A locked phone in an emergency
// must still be able to call for help: Face ID fails routinely (a mask, the
// dark, wet hands, shaking), and "authenticate before you can call for help"
// is the one failure mode this app cannot ship. Do not "tidy" the SOS button
// off this screen.
//
// The lock is a privacy shield over the user's own content — reports they
// filed, their messages, their address — not a security boundary. All real
// authorization is server-side. Someone who defeats the lock still holds a
// session token and nothing more than they already had.

import { useCallback, useEffect, useState } from "react";
import type { Profile } from "@/lib/auth";
import SosSheets from "@/components/SOS";
import { authenticate, biometryStatus, biometryLabel, type BiometryKind } from "@/lib/biometric/client";

export default function AppLock({ profile, onUnlock }: { profile: Profile; onUnlock: () => void }) {
  const [kind, setKind] = useState<BiometryKind>("none");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [sosOpen, setSosOpen] = useState(false);

  const attempt = useCallback(async () => {
    setBusy(true);
    setFailed(null);
    const r = await authenticate("Unlock CrimeAI");
    setBusy(false);
    if (r.ok) onUnlock();
    // A cancel is a deliberate choice, not an error to shout about.
    else if (!r.cancelled) setFailed(r.reason || "Could not verify");
  }, [onUnlock]);

  useEffect(() => {
    let cancelled = false;
    biometryStatus().then((s) => {
      if (cancelled) return;
      setKind(s.kind);
      // If biometry has been turned off or unenrolled at the OS level since
      // the user opted in, refusing to open the app would strand them with no
      // way back in. Fail OPEN — the lock is a privacy shield, not a gate.
      if (!s.available) onUnlock();
      else attempt();
    });
    return () => { cancelled = true; };
  }, [attempt, onUnlock]);

  const label = biometryLabel(kind);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-shell px-6">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-brand" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h1 className="mt-5 text-lg font-semibold text-ink">CrimeAI is locked</h1>
        <p className="mt-1.5 text-sm text-ink2">Unlock with {label} to continue.</p>

        {failed && <p className="mt-3 max-w-xs text-xs text-danger">{failed}</p>}

        <button
          onClick={attempt}
          disabled={busy}
          className="mt-6 w-56 rounded-xl bg-brand py-3.5 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? "Verifying…" : `Unlock with ${label}`}
        </button>
      </div>

      {/* ── The escape hatch. Never gate this. ── */}
      <div className="absolute inset-x-0 bottom-0 px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <button
          onClick={() => setSosOpen(true)}
          className="w-full rounded-xl border border-danger/40 bg-danger/10 py-3.5 text-sm font-semibold text-danger active:scale-[0.99]"
        >
          Emergency — SOS
        </button>
        <p className="mt-2 text-center text-[11px] text-ink3">Works without unlocking.</p>
      </div>

      <SosSheets open={sosOpen} onClose={() => setSosOpen(false)} profile={profile} />
    </div>
  );
}
