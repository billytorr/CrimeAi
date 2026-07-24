"use client";

import { apiUrl } from "@/lib/api";
import { useRef, useState } from "react";
import { defaultAlerts, saveProfile, type AlertPrefs, type Profile } from "@/lib/auth";
import { NEIGHBORHOODS } from "@/lib/data";
import type { ResolvedLocation } from "@/lib/types";
import { Pin } from "@/components/Icons";
import Avatar from "@/components/Avatar";
import UsernameField, { type UsernameState } from "@/components/UsernameField";
import { CATEGORIES } from "@/lib/categories";
import { milesBetween } from "@/lib/data";

// Miami examples front and center (beta focus), but any US place works.
const EXAMPLES = ["Brickell", "South Beach", "Wynwood", "Coral Gables", "33139", "Orlando FL"];
const CATS = CATEGORIES.map((c) => ({ id: c.id, label: c.short, color: c.color }));

function nearest(lat: number, lon: number) {
  let best = NEIGHBORHOODS[0], d = Infinity;
  for (const n of NEIGHBORHOODS) {
    const dd = (n.lat - lat) ** 2 + (n.lon - lon) ** 2;
    if (dd < d) { d = dd; best = n; }
  }
  return best;
}

export default function Onboarding({
  name: initialName, email, userId, existing, onDone,
}: {
  name: string; email: string; userId: string; existing?: Profile | null; onDone: (p: Profile) => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName === "Neighbor" ? "" : initialName);
  const [photo, setPhoto] = useState(existing?.photo || "");
  const [handle, setHandle] = useState(existing?.handle || "");
  const [handleState, setHandleState] = useState<UsernameState>("idle");
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [usedGeo, setUsedGeo] = useState(false);
  const [alerts, setAlerts] = useState<AlertPrefs>(existing?.alerts || defaultAlerts());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // re-running onboarding (e.g. changing address) keeps an already-claimed handle
  const handleOk = handleState === "available" || (!!existing?.handle && handle === existing.handle);

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPhoto(String(r.result));
    r.readAsDataURL(f);
  }

  async function resolve(addr: string) {
    const q = addr.trim();
    if (!q) { setError("Enter a neighborhood, city, ZIP, or address."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(apiUrl("/api/crimeai/lookup"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: q }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Could not find that place."); setBusy(false); return; }
      setAddress(q); setLocation(data.location); setUsedGeo(false); setStep(2);
    } catch { setError("Network error. Try again."); } finally { setBusy(false); }
  }

  function useMyLocation() {
    setError(""); setBusy(true);
    if (!navigator.geolocation) { setBusy(false); setError("Location not available — type your address instead."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const n = nearest(lat, lon);
        // only snap to a Miami neighborhood when the user is actually near it
        const nearMiami = milesBetween(lat, lon, n.lat, n.lon) <= 30;
        setLocation(nearMiami
          ? { query: "My location", lat: n.lat, lon: n.lon, neighborhood: n.name, city: "Miami", state: "FL", source: "gazetteer" }
          : { query: "My location", lat, lon, neighborhood: "My neighborhood", city: "", state: "", source: "gazetteer" });
        setAddress(nearMiami ? n.name : "My location"); setUsedGeo(true); setBusy(false); setStep(2);
      },
      () => { setBusy(false); setError("Couldn't get your location — type your address instead."); },
      { timeout: 8000 }
    );
  }

  async function finish() {
    if (!location) return;
    const profile: Profile = {
      photo, handle, address, location, usedGeolocation: usedGeo,
      phone: existing?.phone || "", contacts: existing?.contacts || [], alerts,
    };
    try {
      await saveProfile(profile);
    } catch (e) {
      // unique-constraint race on the handle: someone claimed it mid-flow
      if (String((e as Error).message).includes("duplicate")) {
        setError("Your username was just taken — go back and pick another.");
        setStep(0);
        return;
      }
      throw e;
    }
    onDone(profile);
  }

  const toggleCat = (id: string) =>
    setAlerts((a) => ({ ...a, categories: a.categories.includes(id) ? a.categories.filter((c) => c !== id) : [...a.categories, id] }));

  return (
    <div className="scroll-area safe-top flex flex-col px-6 pb-8 pt-12">
      <div className="mb-6 flex gap-2">
        {[0, 1, 2].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${step >= i ? "bg-brand" : "bg-ink/10"}`} />)}
      </div>

      {/* STEP 0 — identity */}
      {step === 0 && (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Set up your profile</h1>
          <p className="mt-2 text-sm text-ink2">Your neighbors see your name and photo when you post or report.</p>
          <div className="mt-6 flex flex-col items-center">
            <button onClick={() => fileRef.current?.click()} className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-full border-2 border-dashed border-ink/20 bg-shell">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="profile" className="h-full w-full object-cover" />
              ) : (
                <Avatar name={name} size={96} />
              )}
              <span className="absolute bottom-0 w-full bg-brand/90 py-0.5 text-[10px] font-semibold text-white">{photo ? "Change" : "Add photo"}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
          </div>
          <label className="mt-6 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink2">Full name <span className="text-red-400">*</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria López" autoCapitalize="words" className="w-full rounded-xl border border-ink/10 bg-shell px-4 py-3 text-base outline-none placeholder:text-ink3 focus:border-brand/60" />
          </label>
          <div className="mt-4">
            <UsernameField value={handle} onChange={setHandle} onState={setHandleState} name={name} email={email} ownId={userId} />
            <p className="mt-1.5 text-[11px] text-ink3">Your unique @username — how neighbors find, follow, and message you.</p>
          </div>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <button
            onClick={() => {
              if (!name.trim()) return setError("Please enter your name.");
              if (!handleOk) return setError(handleState === "taken" ? "That username is taken — pick another or tap a suggestion." : "Choose an available username to continue.");
              setError(""); setStep(1);
            }}
            className="mt-6 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white active:scale-[0.99]"
          >
            Continue →
          </button>
        </>
      )}

      {/* STEP 1 — location + radius */}
      {step === 1 && (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Where's home?</h1>
          <p className="mt-2 text-sm text-ink2">CrimeAI grounds every answer and alert in your area.</p>
          <button onClick={useMyLocation} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand/10 py-3.5 text-sm font-semibold text-brand active:scale-[0.99]">
            <Pin size={16} /> {busy ? "Locating…" : "Use my current location"}
          </button>
          <div className="my-4 flex items-center gap-3 text-xs text-ink3"><span className="h-px flex-1 bg-ink/10" />or enter it<span className="h-px flex-1 bg-ink/10" /></div>
          <input value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && resolve(address)} placeholder="Address, neighborhood, or ZIP" autoCapitalize="words" className="w-full rounded-xl border border-ink/10 bg-shell px-4 py-3.5 text-base outline-none placeholder:text-ink3 focus:border-brand/60" />
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => <button key={ex} onClick={() => resolve(ex)} className="rounded-full border border-ink/10 bg-ink/5 px-3 py-1.5 text-xs text-ink2 active:scale-95">{ex}</button>)}
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <button onClick={() => resolve(address)} disabled={busy} className="mt-5 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60">
            {busy ? "Locating…" : "Continue →"}
          </button>
        </>
      )}

      {/* STEP 2 — alerts */}
      {step === 2 && (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Alerts & radius</h1>
          <p className="mt-2 text-sm text-ink2">What should we watch for, and how far around {location?.neighborhood}?</p>

          <div className="mt-5 text-xs font-medium uppercase tracking-wide text-ink2">Alert radius — {alerts.radiusMiles} mi</div>
          <input type="range" min={0.25} max={5} step={0.25} value={alerts.radiusMiles} onChange={(e) => setAlerts((a) => ({ ...a, radiusMiles: parseFloat(e.target.value) }))} className="mt-2 w-full accent-brand" />

          <div className="mt-5 text-xs font-medium uppercase tracking-wide text-ink2">Alert me about</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATS.map((c) => {
              const on = alerts.categories.length === 0 || alerts.categories.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggleCat(c.id)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${on ? "border-ink/20 bg-ink/10 text-ink" : "border-ink/10 text-ink3"}`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color, opacity: on ? 1 : 0.4 }} />{c.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5 text-xs font-medium uppercase tracking-wide text-ink2">Notify me via</div>
          <div className="mt-2 space-y-2">
            <Toggle label="Push notifications" on={alerts.channels.push} onChange={(v) => setAlerts((a) => ({ ...a, channels: { ...a.channels, push: v } }))} />
            <Toggle label="Text message (SMS)" on={alerts.channels.sms} onChange={(v) => setAlerts((a) => ({ ...a, channels: { ...a.channels, sms: v } }))} />
            <Toggle label="Email" on={alerts.channels.email} onChange={(v) => setAlerts((a) => ({ ...a, channels: { ...a.channels, email: v } }))} />
          </div>

          <button onClick={finish} className="mt-7 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white active:scale-[0.99]">
            Enter CrimeAI →
          </button>
        </>
      )}
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between rounded-xl border border-ink/10 bg-shell px-3 py-2.5">
      <span className="text-sm text-ink">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-brand" : "bg-ink/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
