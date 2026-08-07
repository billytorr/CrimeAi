"use client";

// "Who to follow" — the last step of onboarding.
//
// @crimeai (and any other official account) sits at the top, pre-selected;
// everyone else is a PUBLIC profile inside the radius the user just chose.
//
// Nothing is written until the user presses Continue. Pre-selecting
// @crimeai sets the default without silently following anybody on their
// behalf — they can deselect it before continuing, and skipping the step
// follows nobody at all.

import { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "@/lib/api";
import { toggleFollowState } from "@/lib/social";
import Avatar from "@/components/Avatar";
import VerifyPrompt from "@/components/VerifyPrompt";
import { Verified } from "@/components/Icons";

interface Suggestion {
  handle: string;
  name: string;
  photoUrl: string;
  neighborhood: string;
  distanceMiles: number | null;
  isOfficial: boolean;
}

export default function SuggestedFollows({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authHeaders()
      .then((h) => fetch(apiUrl("/api/me/suggestions?limit=20"), { headers: h }))
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: Suggestion[] = d.suggestions || [];
        setItems(list);
        // official accounts start selected — the default, not a decision
        setSelected(new Set(list.filter((s) => s.isOfficial).map((s) => s.handle)));
      })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);

  const toggle = (handle: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle); else next.add(handle);
      return next;
    });

  async function continueOn() {
    setBusy(true);
    // Follow sequentially and swallow failures — a follow that doesn't take
    // is not a reason to trap someone on the last screen of signup.
    for (const handle of Array.from(selected)) {
      try { await toggleFollowState(handle, userId); } catch { /* keep going */ }
    }
    setBusy(false);
    onDone();
  }

  if (items === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-sm text-ink3">Finding neighbors…</div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Who to follow</h1>
      <p className="mt-2 text-sm text-ink2">
        {items.length > 1
          ? "CrimeAI posts alerts, updates and how-tos. These neighbors are near you and public."
          : "Follow CrimeAI for alerts, updates and how-tos."}
      </p>

      <div className="mt-5 space-y-2">
        {items.map((s) => {
          const on = selected.has(s.handle);
          return (
            <div key={s.handle} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-shell px-3 py-2.5">
              <Avatar photo={s.photoUrl} name={s.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink">{s.name}</span>
                  {s.isOfficial && (
                    <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                      Official
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-ink3">
                  @{s.handle}
                  {s.isOfficial
                    ? " · Alerts, updates & tutorials"
                    : s.distanceMiles !== null
                      ? ` · ${s.distanceMiles < 0.1 ? "nearby" : `${s.distanceMiles} mi away`}`
                      : s.neighborhood ? ` · ${s.neighborhood}` : ""}
                </div>
              </div>
              <button
                onClick={() => toggle(s.handle)}
                aria-pressed={on}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  on ? "bg-brand text-white" : "border border-ink/20 text-ink"
                }`}
              >
                {on ? "Following" : "Follow"}
              </button>
            </div>
          );
        })}
      </div>

      {items.length <= 1 && (
        <p className="mt-4 text-xs leading-relaxed text-ink3">
          No public neighbors in your radius yet — you&apos;re early. As people join near you, they&apos;ll show up in
          Search and on the map.
        </p>
      )}

      {/* Optional ID verification, offered once at the end of signup. Framed
          as a choice with a stated cost, not a wall — declining still lands
          you in a fully working app, and Settings has the way back. */}
      <div className="mt-6 rounded-xl border border-brand/25 bg-brand/5 p-4">
        <div className="flex items-center gap-1.5">
          <span className="text-brand"><Verified size={15} /></span>
          <p className="text-sm font-semibold text-ink">Want to report crime?</p>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-ink2">
          Filing a crime report needs a verified ID — reports pin to the map and neighbors act on them. Everything else
          works without it. Your ID photo and face scan are deleted within 24 hours.
        </p>
        <button
          onClick={() => setVerifying(true)}
          className="mt-3 w-full rounded-lg border border-brand/40 bg-brand/10 py-2.5 text-xs font-semibold text-brand active:scale-[0.99]"
        >
          Verify my ID
        </button>
        <p className="mt-2 text-center text-[11px] text-ink3">Or skip — you can do this any time in Settings.</p>
      </div>

      <button
        onClick={continueOn}
        disabled={busy}
        className="mt-5 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? "Setting up…" : selected.size ? `Follow ${selected.size} & enter CrimeAI →` : "Enter CrimeAI →"}
      </button>

      {verifying && <VerifyPrompt status="none" onClose={() => setVerifying(false)} />}
    </>
  );
}
