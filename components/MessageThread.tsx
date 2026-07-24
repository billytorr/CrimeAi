"use client";

import { useEffect, useRef, useState } from "react";
import { getThread, sendDM, markRead, pendingReply, appendReply, type DM } from "@/lib/messages";
import { timeAgoShort, getProfileDirectory } from "@/lib/social";
import Avatar from "@/components/Avatar";
import { useOpenProfile } from "@/lib/profileContext";
import { Chevron, Send, Verified } from "@/components/Icons";

export default function MessageThread({
  handle, name, color, verified, onClose,
}: {
  handle: string; name: string; color: string; verified?: boolean; onClose: () => void;
}) {
  const [thread, setThread] = useState<DM[]>([]);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);
  const openProfile = useOpenProfile();

  useEffect(() => { setThread(getThread(handle)); markRead(handle); }, [handle]);
  useEffect(() => { getProfileDirectory().then((d) => setPhoto(d.get(handle)?.photo || undefined)).catch(() => {}); }, [handle]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread]);

  function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    setThread(sendDM(handle, t));
    // One contextual reply so the conversation reads as two-way (demo).
    const reply = pendingReply(handle);
    if (reply) setTimeout(() => { setThread(appendReply(handle, reply)); markRead(handle); }, 1300);
  }

  return (
    <div className="absolute inset-0 z-[1200] flex flex-col bg-shell fade-in">
      {/* header */}
      <div className="safe-top flex items-center gap-3 border-b border-ink/10 px-4 pb-3 pt-4">
        <button onClick={onClose} className="-ml-1 text-ink2"><Chevron size={22} style={{ transform: "rotate(180deg)" }} /></button>
        <button onClick={() => { openProfile(handle); onClose(); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar photo={photo} name={name} color={color} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-sm font-semibold">{name}{verified && <span className="text-brand"><Verified size={13} /></span>}</div>
            <div className="text-[11px] text-ink3">@{handle} · tap to view profile</div>
          </div>
        </button>
      </div>

      {/* messages */}
      <div className="scroll-area space-y-2.5 px-4 py-4">
        <p className="mx-auto mb-2 w-fit rounded-full bg-ink/5 px-3 py-1 text-[11px] text-ink3">
          Messages are for coordinating on safety. Be respectful — no harassment or sharing personal info.
        </p>
        {thread.map((m) => (
          <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed ${m.fromMe ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-ink/10 bg-card text-ink"}`}>
              {m.text}
              <div className={`mt-0.5 text-[10px] ${m.fromMe ? "text-white/60" : "text-ink3"}`}>{timeAgoShort(m.ts)}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div className="safe-bottom flex items-center gap-2 border-t border-ink/10 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Message ${name.split(" ")[0]}…`}
          className="w-full rounded-full border border-ink/10 bg-card px-4 py-3 text-[15px] outline-none placeholder:text-ink3 focus:border-brand/60"
        />
        <button onClick={send} disabled={!text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white active:scale-95 disabled:opacity-50"><Send size={18} /></button>
      </div>
    </div>
  );
}
