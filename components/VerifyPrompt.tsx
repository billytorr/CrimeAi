"use client";

// The ID-verification sheet. One component, three entry points: the REPORT
// tab, Settings, and the optional onboarding step — so the consent wording
// and the flow can never drift apart between them.
//
// ⚠️ BIPA: the consent text is shown IN FULL before any capture, the box
// starts unticked, and declining is a real, working choice. A pre-ticked
// box or a "by continuing you agree" is not consent under Illinois law.

import { useState } from "react";
import { CONSENT_TEXT, CONSENT_CHECKBOX } from "@/lib/identity/consent";
import { startVerification, type VerificationStatus } from "@/lib/identity/verify-client";

export default function VerifyPrompt({
  status, reason, onClose, onSubmitted,
}: {
  status: VerificationStatus;
  reason?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    const r = await startVerification(true);
    setBusy(false);

    if (r.ok) {
      // Consent is recorded either way; alreadyPending just means they had
      // an attempt open, which is still a success from here.
      onSubmitted?.();
      onClose();
      return;
    }
    // Show what actually went wrong. A single generic string for every
    // failure made a missing migration indistinguishable from a dead network.
    setNote(r.message || "Could not start verification. Please try again.");
  }

  if (status === "pending") {
    return (
      <Sheet onClose={onClose} title="Verification in review">
        <p className="text-sm text-ink2">
          We&apos;ve got your ID and we&apos;re checking it. This usually takes a few minutes, sometimes up to a day.
          You&apos;ll be able to file reports as soon as it clears.
        </p>
        <button onClick={onClose} className="mt-6 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white">Got it</button>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} title="Verify your ID to report">
      {status === "rejected" && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 p-3">
          <p className="text-xs font-semibold text-danger">Your last attempt wasn&apos;t approved</p>
          {reason && <p className="mt-1 text-xs text-ink2">{reason}</p>}
          <p className="mt-1 text-xs text-ink3">You can try again below.</p>
        </div>
      )}

      <p className="text-sm text-ink2">
        Anyone can post, comment and follow on CrimeAI. Filing a <strong className="text-ink">crime report</strong> needs
        a verified ID — reports pin to the map and neighbors act on them, so they have to come from real, accountable people.
      </p>

      <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-ink/10 bg-shell p-3">
        {CONSENT_TEXT.split("\n").map((line, i) =>
          line ? <p key={i} className="mb-2 text-xs leading-relaxed text-ink2">{line}</p> : <div key={i} className="h-1" />
        )}
      </div>

      <button
        onClick={() => setConsented((v) => !v)}
        role="checkbox"
        aria-checked={consented}
        className="mt-4 flex w-full items-start gap-2.5 text-left"
      >
        <span className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${consented ? "border-brand bg-brand text-white" : "border-ink/30"}`}>
          {consented && <span className="text-[11px] leading-none">✓</span>}
        </span>
        <span className="text-xs leading-relaxed text-ink2">{CONSENT_CHECKBOX}</span>
      </button>

      {note && <p className="mt-3 rounded-lg bg-ink/5 p-2.5 text-xs text-ink2">{note}</p>}

      <button
        onClick={submit}
        disabled={!consented || busy}
        className="mt-5 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-40"
      >
        {busy ? "Starting…" : "Continue to ID check"}
      </button>
      <button onClick={onClose} className="mt-2 w-full py-2.5 text-sm text-ink3">Not now</button>
    </Sheet>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-card p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/15" />
        <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
