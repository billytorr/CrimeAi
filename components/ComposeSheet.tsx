"use client";

// TikTok-style capture-first composer.
//   + button → camera opens immediately (photo/video capture or device upload)
//   Bottom bar: POST · REPORT · LIVE  (LIVE hands off to the broadcaster)
//   Mode row:   PHOTO · VIDEO · TEXT  (TEXT composes from scratch)
//   Shutter:    tap = photo · press-and-hold = record (ring fills red, 2 min max)
//   After capture/upload → description step; REPORT adds a crime category
//   from the shared taxonomy (lib/categories.ts) and pins to the map.
import { useEffect, useRef, useState } from "react";
import { accountHandle, type Account } from "@/lib/auth";
import { addPost, type Post, type PostKind } from "@/lib/social";
import { supabaseEnabled, uploadMedia } from "@/lib/supabase";
import { applyForLive, getMyLiveApplication, type LiveApplication } from "@/lib/liveAccess";
import { Close, Pin, Live as LiveIcon, Lock } from "@/components/Icons";
import { CATEGORIES } from "@/lib/categories";
import { useVerification } from "@/lib/identity/verify-client";
import VerifyPrompt from "@/components/VerifyPrompt";

// Report categories come straight from the shared crime taxonomy —
// anything that involves or can occur in a neighborhood.
export const REPORT_CATS: { id: string; label: string; color: string }[] =
  CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color }));

const MAX_RECORD_MS = 2 * 60 * 1000; // 2 minutes
const HOLD_THRESHOLD_MS = 250; // shorter press = photo, longer = video

// Everything captured in-app is standardized to 1080×1920 (9:16 portrait) —
// photos are cover-cropped onto a canvas, and video records FROM a 9:16
// canvas that mirrors the camera, so the output file itself is 9:16.
const OUT_W = 1080;
const OUT_H = 1920;

function drawCover(ctx: CanvasRenderingContext2D, v: HTMLVideoElement) {
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(OUT_W / vw, OUT_H / vh);
  const dw = vw * scale, dh = vh * scale;
  ctx.drawImage(v, (OUT_W - dw) / 2, (OUT_H - dh) / 2, dw, dh);
}

function pickVideoMime(): string {
  const options = ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const m of options) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

type Tab = "post" | "report";
type CamMode = "photo" | "video" | "text";
type Screen = "camera" | "describe";

export default function ComposeSheet({
  account, onClose, onPosted, onGoLive, startTab = "post",
}: {
  account: Account; onClose: () => void; onPosted: () => void; onGoLive: () => void; startTab?: Tab;
}) {
  const p = account.profile!;
  const [tab, setTab] = useState<Tab>(startTab);
  const [camMode, setCamMode] = useState<CamMode>("photo");
  const [screen, setScreen] = useState<Screen>("camera");
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 of the 2-minute cap
  const [media, setMedia] = useState<{ type: "image" | "video"; url: string } | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<string>("other"); // default until the reporter picks
  const [busy, setBusy] = useState(false);
  const [liveApply, setLiveApply] = useState(false);
  // Crime reports require a verified ID; posting never does.
  const idv = useVerification();
  const [needsVerify, setNeedsVerify] = useState(false);

  // Someone can arrive here on the REPORT tab (e.g. the map's "report this"
  // shortcut) without being verified. Drop them to POST once we know, rather
  // than letting them write a whole report only to be refused at submit.
  useEffect(() => {
    if (!idv.loading && !idv.verified && tab === "report") { setTab("post"); setNeedsVerify(true); }
  }, [idv.loading, idv.verified, tab]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartRef = useRef(0);
  const heldRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Camera lifecycle — opens as soon as the composer mounts, like TikTok.
  // The browser/OS asks permission the FIRST time only; after the user
  // allows it, the grant is remembered per device and the camera opens
  // instantly on every later visit. We cascade constraints so ANY local
  // camera works: rear camera on phones → front/webcam → no-mic devices.
  const [camErrMsg, setCamErrMsg] = useState("");
  const cancelledRef = useRef(false);

  async function openCamera() {
    setCamError(false); setCamErrMsg("");
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: "environment" } }, audio: true }, // phones: rear camera + mic
      { video: true, audio: true },                                     // any camera + mic
      { video: true, audio: false },                                    // camera only (no mic) — photos + silent video
    ];
    let lastErr: unknown = null;
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelledRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamReady(true);
        return;
      } catch (e) { lastErr = e; }
    }
    const name = (lastErr as DOMException)?.name || "";
    setCamError(true);
    setCamErrMsg(
      name === "NotAllowedError" || name === "SecurityError"
        ? "Camera access is blocked. Allow camera for CrimeAI in your device settings, then tap Enable camera."
        : name === "NotFoundError" || name === "OverconstrainedError"
          ? "No camera found on this device."
          : "Couldn't start the camera."
    );
  }

  useEffect(() => {
    cancelledRef.current = false;
    openCamera();
    return () => {
      cancelledRef.current = true;
      stopEverything();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopEverything() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (progressTimer.current) clearInterval(progressTimer.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  // ── capture: tap = photo, hold = video ─────────────────────────────
  function shutterDown() {
    if (!camReady || recording) return;
    heldRef.current = false;
    holdTimer.current = setTimeout(() => { heldRef.current = true; startRecording(); }, HOLD_THRESHOLD_MS);
  }
  function shutterUp() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (recording) stopRecording();
    else if (camReady && !heldRef.current) takePhoto();
  }

  function takePhoto() {
    const v = videoRef.current;
    if (!v) return;
    // 1080×1920 cover-crop — every in-app photo is 9:16
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    drawCover(canvas.getContext("2d")!, v);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setMediaFile(new File([blob], "capture.jpg", { type: "image/jpeg" }));
      setMedia({ type: "image", url: canvas.toDataURL("image/jpeg", 0.85) });
      setScreen("describe");
    }, "image/jpeg", 0.85);
  }

  const rafRef = useRef(0);
  const recordedSecRef = useRef(0);

  function startRecording() {
    const stream = streamRef.current;
    const v = videoRef.current;
    if (!stream || !v) return;
    chunksRef.current = [];

    // Record from a 1080×1920 canvas that mirrors the camera (cover-cropped),
    // so the video FILE itself is 9:16 — not just displayed that way.
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d")!;
    const draw = () => { drawCover(ctx, v); rafRef.current = requestAnimationFrame(draw); };
    draw();

    const canvasStream = canvas.captureStream(30);
    stream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));

    const mime = pickVideoMime();
    const rec = new MediaRecorder(canvasStream, mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000 } : undefined);
    recorderRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      cancelAnimationFrame(rafRef.current);
      recordedSecRef.current = Math.min(120, Math.round((Date.now() - recStartRef.current) / 1000));
      // an explicit type is required — a typeless data URL won't play back
      const blobType = rec.mimeType || "video/mp4";
      const blob = new Blob(chunksRef.current, { type: blobType });
      const ext = blobType.includes("mp4") ? "mp4" : "webm";
      setMediaFile(new File([blob], `capture.${ext}`, { type: blobType }));
      const r = new FileReader();
      r.onload = () => {
        setMedia({ type: "video", url: String(r.result) });
        setScreen("describe");
      };
      r.readAsDataURL(blob);
    };
    rec.start(250);
    recStartRef.current = Date.now();
    setRecording(true);
    setProgress(0);
    progressTimer.current = setInterval(() => {
      const el = Date.now() - recStartRef.current;
      setProgress(Math.min(1, el / MAX_RECORD_MS));
      if (el >= MAX_RECORD_MS) stopRecording(); // hard cap at 2 minutes
    }, 100);
  }

  function stopRecording() {
    if (progressTimer.current) clearInterval(progressTimer.current);
    setRecording(false);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  // Returning from the describe step remounts the <video> element —
  // reattach the still-running camera stream so the viewfinder isn't black.
  useEffect(() => {
    if (screen === "camera" && camReady && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [screen, camReady]);

  // ── upload from device storage (bottom-left box) ───────────────────
  function pickMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setMediaFile(f);
    const type: "image" | "video" = f.type.startsWith("video") ? "video" : "image";
    const r = new FileReader();
    r.onload = () => { setMedia({ type, url: String(r.result) }); setScreen("describe"); };
    r.readAsDataURL(f);
  }

  // ── publish ─────────────────────────────────────────────────────────
  const isReport = tab === "report";
  const canPost = text.trim().length > 0 || !!media;

  async function submit() {
    if (!canPost || busy) return;
    setBusy(true);
    try {
      let mediaForPost = media || undefined;
      if (supabaseEnabled && mediaFile) {
        const up = await uploadMedia(mediaFile, account.id);
        mediaForPost = { type: up.type, url: up.url };
      }
      // reports pin to the map; otherwise: video → reel, photo → post, text → thread
      const kind: PostKind = isReport ? "report" : mediaForPost?.type === "video" ? "reel" : mediaForPost ? "image" : "thread";
      const post: Post = {
        id: `mine-${Date.now()}`,
        kind,
        author: account.name,
        handle: accountHandle(account),
        color: "#1b7f3a",
        verified: false,
        neighborhood: p.location.neighborhood,
        lat: p.location.lat + (Math.random() - 0.5) * 0.006,
        lon: p.location.lon + (Math.random() - 0.5) * 0.006,
        text: text.trim(),
        category: isReport ? category : undefined,
        media: mediaForPost,
        durationSec: kind === "reel" && recordedSecRef.current ? recordedSecRef.current : undefined,
        createdAt: new Date().toISOString(),
        likes: 0, comments: 0, shares: 0, mine: true,
      };
      await addPost(post, account.id);
      onPosted();
      onClose();
    } catch (e) {
      alert("Could not post: " + (e as Error).message);
      setBusy(false);
    }
  }

  // ring geometry for the recording progress
  const R = 40, C = 2 * Math.PI * R;

  // ── DESCRIBE step ───────────────────────────────────────────────────
  if (screen === "describe") {
    return (
      <div className="fade-in absolute inset-0 z-[1300] flex flex-col bg-shell">
        <div className="safe-top flex items-center justify-between border-b border-ink/10 px-4 pb-3 pt-4">
          <button onClick={() => { setScreen("camera"); setMedia(null); setMediaFile(null); }} className="text-sm text-ink2">← Back</button>
          <h3 className="text-sm font-semibold">{isReport ? "New report" : "New post"}</h3>
          <button onClick={submit} disabled={!canPost || busy} className={`rounded-lg px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${isReport ? "bg-signal-red" : "bg-brand"}`}>
            {busy ? "Posting…" : isReport ? "Report" : "Post"}
          </button>
        </div>

        <div className="scroll-area px-5 py-4">
          {media && (
            // 9:16 playback frame — captures are 1080×1920, so they fill it exactly
            <div className="relative mx-auto mb-4 aspect-[9/16] w-[58%] max-w-[230px] overflow-hidden rounded-2xl border border-ink/10 bg-black">
              {media.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media.url} alt="capture" className="h-full w-full object-cover" />
              ) : (
                <video src={media.url} className="h-full w-full object-cover" controls playsInline autoPlay muted loop />
              )}
              <button onClick={() => { setMedia(null); setMediaFile(null); setScreen("camera"); }} className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white"><Close size={15} /></button>
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus={!media}
            placeholder={isReport ? "Describe what you saw — what, where, when. No names or identifying details." : `What's happening in ${p.location.neighborhood}?`}
            rows={media ? 3 : 6}
            className="w-full resize-none rounded-xl border border-ink/10 bg-card px-3.5 py-3 text-[15px] outline-none placeholder:text-ink3 focus:border-brand/60"
          />

          {isReport && (
            <>
              <div className="mt-4 text-xs font-medium uppercase tracking-wide text-ink2">What kind of activity?</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {REPORT_CATS.map(({ id, label, color }) => {
                  const on = category === id;
                  return (
                    <button key={id} onClick={() => setCategory(id)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${on ? "border-ink/30 text-ink" : "border-ink/10 text-ink2"}`} style={on ? { background: `${color}33` } : {}}>
                      <span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-brand"><Pin size={13} /> This report will be pinned on the map near {p.location.neighborhood}.</p>
            </>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-ink3">
            {isReport ? "Reports appear in the local feed and on the map. " : "Posts appear in the local feed. "}
            Be accurate — no naming or identifying individuals. For emergencies, call 911.
          </p>
        </div>
      </div>
    );
  }

  // ── CAMERA step (TikTok-style) ──────────────────────────────────────
  return (
    <div className="fade-in absolute inset-0 z-[1300] flex flex-col bg-black">
      {/* viewfinder — intentionally clean: just the picture */}
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        {!camReady && !camError && <div className="absolute inset-0 grid place-items-center text-sm text-white/60">Opening camera…</div>}
        {camError && camMode !== "text" && (
          <div className="absolute inset-0 grid place-items-center px-10 text-center">
            <div>
              <p className="text-sm text-white/80">{camErrMsg || "Camera unavailable."}</p>
              <button onClick={openCamera} className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black active:scale-95">
                Enable camera
              </button>
              <p className="mt-3 text-xs text-white/50">Or upload from your device below, or switch to TEXT.</p>
            </div>
          </div>
        )}

        {/* close */}
        <button onClick={onClose} className="safe-top absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white" aria-label="Close"><Close size={20} /></button>

        {/* TEXT mode composes from scratch on a dark canvas */}
        {camMode === "text" && (
          <div className="absolute inset-0 flex flex-col justify-center bg-shell/95 px-6">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              placeholder={isReport ? "Describe the safety issue you want to report…" : "What do you want to tell your neighborhood?"}
              rows={7}
              className="w-full resize-none rounded-2xl border border-ink/10 bg-card px-4 py-3.5 text-lg leading-relaxed outline-none placeholder:text-ink3 focus:border-brand/60"
            />
            <button onClick={() => setScreen("describe")} disabled={!text.trim()} className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-40">
              Continue →
            </button>
          </div>
        )}

        {/* capture mode row + shutter + upload box */}
        {camMode !== "text" && (
          <div className="absolute inset-x-0 bottom-0 pb-6">
            <div className="mb-5 flex items-center justify-center gap-6 text-[13px] font-semibold">
              {(["photo", "video", "text"] as CamMode[]).map((m) => (
                <button key={m} onClick={() => setCamMode(m)} className={m === camMode ? "rounded-full bg-white px-3.5 py-1 text-black" : "text-white/80"}>
                  {m.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="relative flex items-center justify-center">
              {/* upload from device — bottom-left box, like TikTok */}
              <button onClick={() => fileRef.current?.click()} className="absolute left-8 grid h-11 w-11 place-items-center overflow-hidden rounded-lg border-2 border-white/70 bg-black/40" aria-label="Upload from device">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
              </button>
              <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={pickMedia} />

              {/* shutter: tap = photo, hold = record; ring fills red while recording */}
              <button
                onPointerDown={shutterDown}
                onPointerUp={shutterUp}
                onPointerLeave={() => { if (recording) stopRecording(); else if (holdTimer.current) clearTimeout(holdTimer.current); }}
                className="relative grid h-24 w-24 place-items-center"
                aria-label="Capture"
              >
                <svg width="96" height="96" viewBox="0 0 96 96" className="absolute inset-0 -rotate-90">
                  <circle cx="48" cy="48" r={R} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="5" />
                  {recording && (
                    <circle cx="48" cy="48" r={R} fill="none" stroke="#e31e28" strokeWidth="5" strokeLinecap="round"
                      strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
                  )}
                </svg>
                <span className={`rounded-full bg-white transition-all ${recording ? "h-9 w-9 rounded-xl bg-red-500" : "h-[68px] w-[68px]"}`} />
              </button>
            </div>

            {recording && (
              <p className="mt-3 text-center text-xs font-semibold text-red-400">
                ● {Math.floor((progress * 120) / 60)}:{String(Math.floor((progress * 120) % 60)).padStart(2, "0")} / 2:00
              </p>
            )}
          </div>
        )}
      </div>

      {/* bottom bar: POST · REPORT · LIVE */}
      <div className="safe-bottom flex items-center justify-center gap-10 bg-black py-3 text-[15px] font-semibold">
        <button onClick={() => setTab("post")} className={tab === "post" ? "text-white" : "text-white/40"}>POST</button>
        {/* Posting is open to everyone; REPORTING requires a verified ID.
            The tab stays visible and tappable — hiding it would leave people
            hunting for where reporting went. Tapping it unverified explains
            why and offers the way through. */}
        <button
          onClick={() => (idv.verified || idv.loading ? setTab("report") : setNeedsVerify(true))}
          className={`flex items-center gap-1 ${tab === "report" ? "text-white" : "text-white/40"}`}
        >
          REPORT{!idv.verified && !idv.loading && <Lock size={11} />}
        </button>
        <button
          onClick={() => (p.liveEnabled ? (onGoLive(), onClose()) : setLiveApply(true))}
          className="flex items-center gap-1 text-white/40"
        >
          <LiveIcon size={14} /> LIVE
        </button>
      </div>

      {liveApply && <LiveApplySheet account={account} onClose={() => setLiveApply(false)} />}
      {needsVerify && (
        <VerifyPrompt status={idv.status} reason={idv.reason} onClose={() => setNeedsVerify(false)} />
      )}
    </div>
  );
}

// LIVE is invite-only: reserved for Live Media Brand Ambassadors.
// Everyone else sees Coming Soon + an application that lands in the
// Command Center, where the team reviews and enables per user.
function LiveApplySheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const [existing, setExisting] = useState<LiveApplication | null | "loading">("loading");
  const [reason, setReason] = useState("");
  const [experience, setExperience] = useState("");
  const [socials, setSocials] = useState("");
  const [phone, setPhone] = useState(account.profile?.phone || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getMyLiveApplication(account.id).then((a) => setExisting(a)).catch(() => setExisting(null));
  }, [account.id]);

  async function submit() {
    if (!reason.trim() || !experience.trim()) { setError("Tell us why you want to join and your relevant experience."); return; }
    setBusy(true); setError("");
    try {
      await applyForLive(
        { id: account.id, name: account.name, email: account.email, handle: accountHandle(account) },
        { reason, experience, socials, phone }
      );
      setSent(true);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  const pending = sent || (existing !== "loading" && existing?.status === "pending");
  const declined = !sent && existing !== "loading" && existing?.status === "declined";

  return (
    <div className="fade-in absolute inset-0 z-[1350] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="sheet-in safe-bottom relative max-h-[88%] overflow-y-auto rounded-t-3xl border-t border-ink/10 bg-card px-5 pb-8 pt-3" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/20" />
        <div className="flex flex-col items-center text-center">
          <span className="pulse grid h-12 w-12 place-items-center rounded-full bg-signal-red text-white"><LiveIcon size={22} /></span>
          <h3 className="mt-3 text-lg font-bold">LIVE — Coming soon</h3>
          <p className="mt-1 max-w-xs text-sm text-ink2">
            Live streaming is only available to our <span className="font-semibold text-ink">Live Media Brand Ambassadors</span> — trusted neighbors who broadcast safety situations responsibly.
          </p>
        </div>

        {existing === "loading" ? (
          <p className="py-8 text-center text-sm text-ink3">Checking your status…</p>
        ) : pending ? (
          <div className="mt-5 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-center">
            <p className="text-sm font-semibold text-warn">Application under review</p>
            <p className="mt-1 text-xs text-ink2">Our team is reviewing your application. You&apos;ll get LIVE access here the moment you&apos;re approved.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {declined && (
              <p className="rounded-xl bg-ink/5 px-3 py-2 text-center text-xs text-ink2">Your previous application wasn&apos;t approved. You can update it and reapply below.</p>
            )}
            <p className="text-xs font-medium uppercase tracking-wide text-ink2">Apply to join</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why do you want to be a Live Media Brand Ambassador for your neighborhood?" className="w-full resize-none rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
            <textarea value={experience} onChange={(e) => setExperience(e.target.value)} rows={3} placeholder="Relevant experience — media, live streaming, community watch, journalism…" className="w-full resize-none rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
            <input value={socials} onChange={(e) => setSocials(e.target.value)} placeholder="Social links that show your work (optional)" className="w-full rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Phone number (so we can reach you)" className="w-full rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-signal-red py-3 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-60">
              {busy ? "Submitting…" : "Submit application"}
            </button>
            <p className="text-center text-[11px] text-ink3">Reviewed by the CrimeAI team. Broadcasting responsibly is the whole job — no confrontation, ever.</p>
          </div>
        )}
      </div>
    </div>
  );
}
