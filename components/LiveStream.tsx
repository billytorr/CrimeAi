"use client";

import { useEffect, useRef, useState } from "react";
import { accountHandle, type Account } from "@/lib/auth";
import { addPost, updatePost, type Post } from "@/lib/social";
import { supabaseEnabled, uploadMedia } from "@/lib/supabase";
import Avatar from "@/components/Avatar";
import { Close, Send, Pin, Eye } from "@/components/Icons";

const SEED_CHAT = [
  { who: "Brickell Watch", text: "On it — calling it in to MDPD now." },
  { who: "Aisha R.", text: "Stay safe, don't get too close 🙏" },
  { who: "SoBe Neighbors", text: "Sharing to our block group." },
  { who: "Carlos M.", text: "I'm two streets over, heading that way to keep eyes." },
  { who: "Gables Alert", text: "Got the plate? Don't approach, just film from distance." },
];

export default function LiveStream({ account, onClose, onPosted }: { account: Account; onClose: () => void; onPosted: () => void }) {
  const p = account.profile!;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const postIdRef = useRef<string>(`live-${Date.now()}`);

  const [phase, setPhase] = useState<"setup" | "live" | "ending">("setup");
  const [secs, setSecs] = useState(0);
  const [viewers, setViewers] = useState(1);
  const [chat, setChat] = useState<{ who: string; text: string; me?: boolean }[]>([]);
  const [msg, setMsg] = useState("");
  const [camOk, setCamOk] = useState(true);
  const [caption, setCaption] = useState("Suspicious activity — going live to alert the neighborhood.");

  // get camera
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      } catch {
        setCamOk(false); // no camera/permission — demo mode (replay uses a sample clip)
      }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // live timers
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    const v = setInterval(() => setViewers((n) => n + Math.floor(Math.random() * 7)), 2500);
    let i = 0;
    const c = setInterval(() => { if (i < SEED_CHAT.length) { const m = SEED_CHAT[i++]; setChat((cs) => [...cs, m]); } }, 3500);
    return () => { clearInterval(t); clearInterval(v); clearInterval(c); };
  }, [phase]);

  function goLive() {
    // Create the live post immediately so it shows in the feed for followers/local.
    const post: Post = {
      id: postIdRef.current, kind: "live", isLive: true, viewers: 1,
      author: account.name, handle: accountHandle(account), color: "#1b7f3a", verified: false,
      neighborhood: p.location.neighborhood, lat: p.location.lat, lon: p.location.lon,
      text: caption.trim(), tags: ["live", "safety", p.location.neighborhood.toLowerCase().replace(/\s+/g, "")],
      createdAt: new Date().toISOString(), likes: 0, comments: 0, shares: 0, mine: true,
    };
    addPost(post, account.id);
    onPosted();
    // start recording for the replay
    try {
      if (streamRef.current && typeof MediaRecorder !== "undefined") {
        const rec = new MediaRecorder(streamRef.current);
        rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
        rec.start();
        recorderRef.current = rec;
      }
    } catch { /* recording optional */ }
    setPhase("live");
    setViewers(1);
  }

  async function endLive() {
    setPhase("ending");
    // finalize recording → replay media
    let replay: Post["media"] | undefined;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((res) => { rec.onstop = () => res(); rec.stop(); });
      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "video/webm" });
      if (blob.size > 0) {
        if (supabaseEnabled) {
          try { const up = await uploadMedia(new File([blob], "live.webm", { type: blob.type }), account.id); replay = { type: "video", url: up.url }; } catch {}
        } else {
          replay = await new Promise<Post["media"]>((res) => { const r = new FileReader(); r.onload = () => res({ type: "video", url: String(r.result) }); r.readAsDataURL(blob); });
        }
      }
    }
    // demo fallback (no camera): use a sample clip so the replay still plays
    if (!replay) replay = { type: "video", url: "/feed/clip-3045163.mp4" };

    streamRef.current?.getTracks().forEach((t) => t.stop());
    // Save the replay on the feed + the broadcaster's profile.
    await updatePost(postIdRef.current, { isLive: false, media: replay, viewers, durationSec: secs, text: caption.trim() || "Live replay" }, account.id);
    onPosted();
    onClose();
  }

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div className="absolute inset-0 z-[1300] flex flex-col bg-black fade-in">
      {/* camera / preview */}
      <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 h-full w-full object-cover" />
      {!camOk && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-card2 to-shell text-center text-white/60">
          <div className="px-8 text-sm">Camera unavailable in this view.<br />On your phone, CrimeAI will use your real camera.<br />Running in demo mode — a sample clip is saved as the replay.</div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />

      {/* top bar */}
      <div className="safe-top relative z-10 flex items-center gap-2 px-4 pt-4">
        {phase === "live" && <span className="pulse flex items-center gap-1.5 rounded-md bg-signal-red px-2 py-1 text-xs font-bold text-white">● LIVE</span>}
        {phase === "live" && <span className="flex items-center gap-1 rounded-md bg-black/40 px-2 py-1 text-xs text-white backdrop-blur"><Eye size={13} /> {viewers.toLocaleString()}</span>}
        {phase === "live" && <span className="rounded-md bg-black/40 px-2 py-1 text-xs tabular-nums text-white backdrop-blur">{mm}:{ss}</span>}
        <button onClick={phase === "live" ? endLive : onClose} className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur"><Close size={18} /></button>
      </div>

      {/* alert banner */}
      {phase === "live" && (
        <div className="relative z-10 mx-4 mt-3 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/20 px-3 py-2 text-xs text-red-100 backdrop-blur">
          <Pin size={14} /> Alerting neighbors within {p.alerts.radiusMiles} mi of {p.location.neighborhood} · your followers can watch from their feed
        </div>
      )}

      <div className="flex-1" />

      {/* live chat */}
      {phase === "live" && (
        <div className="relative z-10 max-h-[34%] space-y-1.5 overflow-y-auto px-4">
          {chat.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className={`font-semibold ${c.me ? "text-brand" : "text-white"}`}>{c.who}</span>
              <span className="text-white/90">{c.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* bottom controls */}
      <div className="safe-bottom relative z-10 p-4">
        {phase === "setup" && (
          <div className="space-y-3 rounded-2xl border border-white/15 bg-black/50 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-sm text-white"><Avatar photo={p.photo} name={account.name} color="#1b7f3a" size={32} /> Going live as <b>{account.name}</b></div>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} className="w-full resize-none rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/50" placeholder="What are you seeing? (alerts your neighbors)" />
            <p className="text-[11px] text-white/60">Only stream lawful, public observation. Do not confront anyone — film from a safe distance and call 911 for emergencies.</p>
            <button onClick={goLive} className="w-full rounded-xl bg-signal-red py-3 text-sm font-bold text-white active:scale-[0.99]">● Go Live</button>
          </div>
        )}
        {phase === "live" && (
          <div className="flex items-center gap-2">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && msg.trim()) { setChat((cs) => [...cs, { who: account.name, text: msg.trim(), me: true }]); setMsg(""); } }} placeholder="Comment…" className="w-full rounded-full border border-white/20 bg-black/40 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/50 backdrop-blur" />
            <button onClick={endLive} className="shrink-0 rounded-full bg-signal-red px-4 py-2.5 text-sm font-bold text-white">End</button>
          </div>
        )}
        {phase === "ending" && <div className="rounded-2xl bg-black/60 py-3 text-center text-sm text-white backdrop-blur">Saving your live replay to your profile…</div>}
      </div>
    </div>
  );
}
