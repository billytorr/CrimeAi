"use client";

// Instagram/TikTok-style click-through agreement: the Terms of Service
// and Privacy Policy render in one scroll view; the agree checkbox stays
// LOCKED until the reader reaches the bottom, and Continue stays locked
// until the box is checked. Acceptance (doc kind + version + time) is
// recorded once the account exists.
import { useEffect, useRef, useState } from "react";
import { getLegalDocs, stashAcceptance, type LegalDoc } from "@/lib/legal";
import { Close } from "@/components/Icons";

export default function LegalGate({ onAgreed, onClose }: { onAgreed: () => void; onClose: () => void }) {
  const [docs, setDocs] = useState<LegalDoc[] | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { getLegalDocs().then(setDocs).catch(() => setDocs([])); }, []);

  function onScroll() {
    const el = scrollRef.current;
    if (!el || reachedEnd) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) setReachedEnd(true);
  }

  // short docs that fit without scrolling shouldn't lock the checkbox
  useEffect(() => {
    if (!docs) return;
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setReachedEnd(true);
  }, [docs]);

  function agree() {
    if (!checked || !docs) return;
    stashAcceptance(docs);
    onAgreed();
  }

  return (
    <div className="fade-in absolute inset-0 z-[1400] flex flex-col bg-shell">
      <div className="safe-top flex items-center justify-between border-b border-ink/10 px-5 pb-3 pt-4">
        <h1 className="text-base font-bold">Terms & Privacy</h1>
        <button onClick={onClose} className="text-ink2" aria-label="Close"><Close size={20} /></button>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-4">
        {!docs ? (
          <p className="py-12 text-center text-sm text-ink3">Loading documents…</p>
        ) : (
          docs.map((d) => (
            <section key={d.kind} className="mb-8">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-brand">{d.title}</h2>
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink2">{d.body}</pre>
            </section>
          ))
        )}
        <p className="pb-2 text-center text-[11px] text-ink3">— End of documents —</p>
      </div>

      <div className="safe-bottom border-t border-ink/10 bg-card px-5 pb-4 pt-3">
        {!reachedEnd && <p className="mb-2 text-center text-[11px] text-warn">Scroll to the bottom to continue.</p>}
        <label className={`flex items-start gap-2.5 ${reachedEnd ? "" : "opacity-40"}`}>
          <input
            type="checkbox"
            checked={checked}
            disabled={!reachedEnd}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
          />
          <span className="text-xs leading-relaxed text-ink2">
            I have read and agree to the CrimeAI <span className="font-semibold text-ink">Terms of Service</span> and{" "}
            <span className="font-semibold text-ink">Privacy Policy</span>, including the arbitration clause, and I understand
            CrimeAI is not an emergency service — in an emergency I will call 911.
          </span>
        </label>
        <button
          onClick={agree}
          disabled={!checked}
          className="mt-3 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-40"
        >
          Agree & continue
        </button>
      </div>
    </div>
  );
}
