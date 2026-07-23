"use client";

// TikTok-style "Edit profile": photo, display name, @username and bio
// live here — everything else stays in Settings. Name changes cascade
// to every past post and comment; username changes move posts and
// followers (both server-side, atomic).
import { useRef, useState } from "react";
import { saveProfile, updateName, type Account, type Profile } from "@/lib/auth";
import { saveHandle } from "@/lib/username";
import UsernameField, { type UsernameState } from "@/components/UsernameField";
import Avatar from "@/components/Avatar";
import { Camera, Chevron } from "@/components/Icons";

export default function EditProfile({
  account, currentHandle, onSaved, onClose,
}: {
  account: Account; currentHandle: string;
  onSaved: (p: Profile, newName: string) => void; onClose: () => void;
}) {
  const profile = account.profile!;
  const [photo, setPhoto] = useState(profile.photo);
  const [name, setName] = useState(account.name);
  const [handle, setHandle] = useState(currentHandle);
  const [handleState, setHandleState] = useState<UsernameState>("idle");
  const [bio, setBio] = useState(profile.bio || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPhoto(String(r.result));
    r.readAsDataURL(f);
  }

  async function save() {
    setError("");
    if (!name.trim()) { setError("Name can't be empty."); return; }
    const handleChanged = handle !== currentHandle;
    if (handleChanged && handleState !== "available") {
      setError(handleState === "taken" ? "That username is taken." : "Pick an available username first.");
      return;
    }
    setBusy(true);
    try {
      if (handleChanged) await saveHandle(account.id, handle, currentHandle);
      const p: Profile = { ...profile, photo, handle: handleChanged ? handle : profile.handle || currentHandle, bio: bio.trim() };
      await saveProfile(p);
      if (name.trim() !== account.name) await updateName(name); // cascades to all past posts/comments
      onSaved(p, name.trim());
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fade-in absolute inset-0 z-[1250] flex flex-col bg-shell">
      <div className="safe-top flex items-center justify-between border-b border-ink/10 px-4 pb-3 pt-4">
        <button onClick={onClose} className="-ml-1 flex items-center text-ink2"><Chevron size={22} style={{ transform: "rotate(180deg)" }} /></button>
        <h1 className="text-base font-bold">Edit profile</h1>
        <button onClick={save} disabled={busy} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="scroll-area px-6 py-6">
        {/* photo */}
        <div className="flex flex-col items-center">
          <button onClick={() => fileRef.current?.click()} className="relative">
            <Avatar photo={photo} name={name} size={92} />
            <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-2 border-shell bg-brand text-white"><Camera size={15} /></span>
          </button>
          <button onClick={() => fileRef.current?.click()} className="mt-2 text-sm font-medium text-brand">Change photo</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink2">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoCapitalize="words" className="w-full rounded-xl border border-ink/10 bg-card px-4 py-3 text-base outline-none placeholder:text-ink3 focus:border-brand/60" />
            <p className="mt-1 text-[11px] text-ink3">Changing your name updates it on all of your past posts and comments.</p>
          </label>

          <UsernameField value={handle} onChange={setHandle} onState={setHandleState} name={name} email={account.email} ownId={account.id} />
          {handle !== currentHandle && <p className="-mt-1 text-[11px] text-ink3">Your posts and followers move with your new username. @{currentHandle} becomes available to others.</p>}

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink2">Bio</span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={160} placeholder="Tell your neighborhood who you are…" className="w-full resize-none rounded-xl border border-ink/10 bg-card px-4 py-3 text-[15px] outline-none placeholder:text-ink3 focus:border-brand/60" />
            <p className="mt-1 text-right text-[11px] text-ink3">{bio.length}/160</p>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
