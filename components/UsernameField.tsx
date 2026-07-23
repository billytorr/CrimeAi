"use client";

// Instagram-style username picker: live availability as you type
// (debounced), inline validation of the character rules, and tappable
// suggestions derived from the user's name when their pick is taken.
import { useEffect, useRef, useState } from "react";
import { checkHandle, normalizeHandle, suggestHandles, validateHandle, type HandleStatus } from "@/lib/username";

export type UsernameState = "idle" | "checking" | "available" | "taken" | "invalid";

export default function UsernameField({
  value, onChange, onState, name, email, ownId, label = "Username",
}: {
  value: string;
  onChange: (v: string) => void;
  onState?: (s: UsernameState) => void;
  name: string;
  email: string;
  ownId?: string;
  label?: string;
}) {
  const [state, setState] = useState<UsernameState>("idle");
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const set = (s: UsernameState, msg = "") => { setState(s); setMessage(msg); onState?.(s); };

  // live availability — debounced like Instagram's signup field
  useEffect(() => {
    const h = normalizeHandle(value);
    if (timer.current) clearTimeout(timer.current);
    if (!h) { set("idle"); return; }
    const err = validateHandle(h);
    if (err) { set("invalid", err); return; }
    set("checking");
    const mySeq = ++seq.current;
    timer.current = setTimeout(async () => {
      const status: HandleStatus = await checkHandle(h, ownId);
      if (mySeq !== seq.current) return; // a newer keystroke superseded us
      if (status === "available") set("available", "Username available");
      else if (status === "taken") {
        set("taken", "That username is taken.");
        suggestHandles(name, email, ownId).then((s) => { if (mySeq === seq.current) setSuggestions(s); });
      } else set("invalid", validateHandle(h) || "Invalid username.");
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ownId]);

  // first-load suggestions when the field is empty
  useEffect(() => {
    if (!value && (name || email)) suggestHandles(name, email, ownId).then(setSuggestions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, email]);

  const ring =
    state === "available" ? "border-green-500/60" :
    state === "taken" || state === "invalid" ? "border-red-400/70" : "border-ink/10 focus-within:border-brand/60";

  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink2">{label} <span className="text-red-400">*</span></span>
      <div className={`flex items-center rounded-xl border bg-shell px-4 py-3 transition ${ring}`}>
        <span className="mr-0.5 text-base text-ink3">@</span>
        <input
          value={value}
          onChange={(e) => onChange(normalizeHandle(e.target.value.replace(/\s+/g, "")))}
          placeholder="yourusername"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={30}
          className="w-full bg-transparent text-base outline-none placeholder:text-ink3"
        />
        <span className="ml-2 shrink-0">
          {state === "checking" && <Dot spin />}
          {state === "available" && <Mark ok />}
          {(state === "taken" || state === "invalid") && <Mark />}
        </span>
      </div>
      {message && (
        <p className={`mt-1.5 text-xs ${state === "available" ? "text-green-500" : "text-red-400"}`}>{message}</p>
      )}
      {suggestions.length > 0 && (state === "taken" || state === "idle" || !value) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink3">Available:</span>
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => onChange(s)} className="rounded-full border border-ink/10 bg-ink/5 px-3 py-1 text-xs font-medium text-brand active:scale-95">
              @{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Mark({ ok }: { ok?: boolean }) {
  return ok ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" opacity="0.25" /><path d="m8 12.5 2.6 2.6L16 9.5" /></svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" opacity="0.25" /><path d="m9 9 6 6M15 9l-6 6" /></svg>
  );
}
function Dot({ spin }: { spin?: boolean }) {
  return <span className={`block h-3.5 w-3.5 rounded-full border-2 border-ink/20 border-t-brand ${spin ? "animate-spin" : ""}`} />;
}
