"use client";

import { apiUrl } from "@/lib/api";
import { useRef, useState } from "react";
import { defaultAlerts, saveProfile, type AlertPrefs, type Profile } from "@/lib/auth";
import { NEIGHBORHOODS } from "@/lib/data";
import type { ResolvedLocation } from "@/lib/types";
import { Pin, Camera } from "@/components/Icons";
import UsernameField, { type UsernameState } from "@/components/UsernameField";
import { CATEGORIES } from "@/lib/categories";
import { milesBetween } from "@/lib/data";
import SuggestedFollows from "@/components/auth/SuggestedFollows";
import { resizeImage, importRemotePhoto } from "@/lib/photo";

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
  name: initialName, email, userId, existing, draftHandle, draftPhoto, onDone,
}: {
  name: string; email: string; userId: string; existing?: Profile | null;
  draftHandle?: string;
  /** Avatar supplied by Google/Apple at sign-in — a prefill only, never for an existing profile. */
  draftPhoto?: string;
  onDone: (p: Profile) => void;
}) {
  const [step, setStep] = useState(0);
  // the saved profile, held across the final "who to follow" step
  const [saved, setSaved] = useState<Profile | null>(null);
  const [name, setName] = useState(initialName === "Neighbor" ? "" : initialName);
  const [photo, setPhoto] = useState(existing?.photo || draftPhoto || "");
  const [bio, setBio] = useState(existing?.bio || "");
  // username chosen during email signup is carried in via draftHandle;
  // SSO users (no credentials step) pick it here instead.
  const presetHandle = existing?.handle || draftHandle || "";
  const [handle, setHandle] = useState(presetHandle);
  const [handleState, setHandleState] = useState<UsernameState>("idle");
  const needsUsername = !presetHandle;
  const handleOk = !needsUsername || handleState === "available";
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [usedGeo, setUsedGeo] = useState(false);
  const [alerts, setAlerts] = useState<AlertPrefs>(existing?.alerts || defaultAlerts());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try { setPhoto(await resizeImage(f)); }
    catch { setError("Couldn't read that image — try another."); }
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

    // If they kept the Google/Apple avatar, copy it into our own storage now.
    // Done HERE rather than on mount so we only upload a photo they actually
    // kept — replacing it during onboarding leaves nothing orphaned. Fails
    // soft to the provider URL, so this can never block finishing signup.
    const storedPhoto = await importRemotePhoto(photo, userId);

    const profile: Profile = {
      photo: storedPhoto, handle, bio: bio.trim(), address, location, usedGeolocation: usedGeo,
      phone: existing?.phone || "", contacts: existing?.contacts || [], alerts,
    };
    try {
      // pass name/email so the name entered here is persisted (not just metadata)
      await saveProfile(profile, { id: userId, name: name.trim() || "Neighbor", email });
    } catch (e) {
      // unique-constraint race on the handle: someone claimed it mid-flow
      if (String((e as Error).message).includes("duplicate")) {
        setError("Your username was just taken — an admin can help, or start over.");
        return;
      }
      throw e;
    }

    // Ask for notification permission HERE, and only here. This is the moment
    // the user has just chosen a radius, picked categories and switched push
    // on — so the OS prompt lands with the reason for it still on screen,
    // rather than as a cold interruption at first launch. iOS only ever shows
    // this prompt once per install; if they said no to our toggle we don't
    // spend it at all. Awaited so the prompt appears over onboarding, but
    // never allowed to block entry into the app.
    if (alerts.channels.push) {
      try {
        const { registerForPush } = await import("@/lib/push/client");
        await registerForPush({ promptIfNeeded: true });
      } catch { /* a push failure must never strand the user in onboarding */ }
    }

    // Suggestions run AFTER the profile is saved — the query matches on the
    // radius and coordinates that were just written, so it cannot run first.
    setSaved(profile);
    setStep(3);
  }

  const toggleCat = (id: string) =>
    setAlerts((a) => ({ ...a, categories: a.categories.includes(id) ? a.categories.filter((c) => c !== id) : [...a.categories, id] }));

  return (
    <div className="scroll-area safe-top flex flex-col px-6 pb-8 pt-12">
      <div className="mb-6 flex gap-2">
        {[0, 1, 2].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${step >= i ? "bg-brand" : "bg-ink/10"}`} />)}
      </div>

      {/* STEP 0 — profile photo + name + bio */}
      {step === 0 && (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Create your profile</h1>
          <p className="mt-2 text-sm text-ink2">Add a photo and name so neighbors recognize you{handle ? <> as <span className="font-medium text-ink">@{handle}</span></> : null}.</p>
          <div className="mt-6 flex flex-col items-center">
            <button onClick={() => fileRef.current?.click()} className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-full border-2 border-dashed border-ink/20 bg-shell active:scale-95">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="profile" className="h-full w-full object-cover" />
              ) : (
                <span className="grid place-items-center text-ink3"><Camera size={30} /></span>
              )}
              <span className="absolute bottom-0 flex w-full items-center justify-center gap-1 bg-brand/90 py-1 text-[10px] font-semibold text-white"><Camera size={11} /> {photo ? "Change" : "Add photo"}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
          </div>
          <label className="mt-7 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink2">Full name <span className="text-red-400">*</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria López" autoCapitalize="words" className="w-full rounded-xl border border-ink/10 bg-shell px-4 py-3 text-base outline-none placeholder:text-ink3 focus:border-brand/60" />
          </label>
          {needsUsername && (
            <div className="mt-4">
              <UsernameField value={handle} onChange={setHandle} onState={setHandleState} name={name} email={email} ownId={userId} />
              <p className="mt-1.5 text-[11px] text-ink3">Your unique @username — how neighbors find, follow, and message you.</p>
            </div>
          )}
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink2">Bio <span className="font-normal text-ink3">(optional)</span></span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 150))} rows={2} placeholder="Neighbor keeping an eye out. Little Havana." className="w-full resize-none rounded-xl border border-ink/10 bg-shell px-4 py-3 text-base outline-none placeholder:text-ink3 focus:border-brand/60" />
            <span className="mt-1 block text-right text-[11px] text-ink3">{bio.length}/150</span>
          </label>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <button
            onClick={() => {
              if (!name.trim()) return setError("Please enter your name.");
              if (!handleOk) return setError(handleState === "taken" ? "That username is taken — pick another." : "Choose an available username.");
              setError(""); setStep(1);
            }}
            className="mt-5 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white active:scale-[0.99]"
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

          {/* Pre-prompt priming: tell them the OS dialog is coming and why, so
              a reflexive "Don't Allow" doesn't permanently cost them alerts. */}
          {alerts.channels.push && (
            <p className="mt-3 text-xs leading-relaxed text-ink3">
              Next, {typeof navigator !== "undefined" && /iPhone|iPad/.test(navigator.userAgent) ? "iOS" : "your phone"} will
              ask you to allow notifications — that&apos;s how we reach you about incidents within {alerts.radiusMiles} mi.
            </p>
          )}

          <button onClick={finish} className="mt-7 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white active:scale-[0.99]">
            Continue →
          </button>
        </>
      )}

      {step === 3 && saved && (
        <SuggestedFollows userId={userId} onDone={() => onDone(saved)} />
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
