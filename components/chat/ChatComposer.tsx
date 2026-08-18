"use client";

// CrimeAI chat composer — a single rounded "pill" input with a floating "+"
// attachment menu (Camera / Photos / Files), dictation (speak-to-type), send,
// and the shield voice-conversation button. ChatGPT-grade *ergonomics*, but
// 100% CrimeAI brand tokens and CrimeAI's own icons — no borrowed assets.
//
// This is a presentational shell: all the real work (vision, transcription,
// web research, sending, voice mode) stays in AskScreen and is passed in as
// callbacks, so no working backend behaviour changes.

import { useCallback, useRef, useState } from "react";
import AttachmentMenu from "@/components/chat/AttachmentMenu";
import AttachmentPreview, { type Attachment } from "@/components/chat/AttachmentPreview";
import { resizeImage } from "@/lib/photo";

let _id = 0;
const nextId = () => `att_${++_id}`;

export interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  onWebResearch: (text: string) => void;
  onAttachImage: (file: File) => void | Promise<void>;
  onAttachUnsupported: (file: File) => void;
  onToggleMic: () => void;
  onVoiceMode: () => void;
  onKnowYourRights?: () => void;
  isPro: boolean;
  loading: boolean;
  recording: boolean;
  webMode: boolean;
  onToggleWeb: () => void;
  placeholder: string;
}

export default function ChatComposer({
  value, onChange, onSend, onWebResearch, onAttachImage, onAttachUnsupported,
  onToggleMic, onVoiceMode, onKnowYourRights, isPro, loading, recording, webMode, onToggleWeb, placeholder,
}: ChatComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // hidden pickers — Camera uses the device capture intent, Photos the library,
  // Files a document picker. All still image-first (the vision route reads
  // images); non-images degrade gracefully via onAttachUnsupported.
  const cameraRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const hasText = value.trim().length > 0;
  const canSend = (hasText || attachments.length > 0) && !loading;

  // auto-grow the textarea up to a max, then scroll internally
  const autoGrow = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, []);

  async function stageImage(file: File) {
    try {
      const dataUrl = await resizeImage(file, 512); // small thumbnail only
      setAttachments((a) => [...a, { id: nextId(), kind: "image", name: file.name || "photo", dataUrl, file }]);
    } catch {
      setAttachments((a) => [...a, { id: nextId(), kind: "image", name: file.name || "photo", file }]);
    }
  }

  function onPicked(file: File | undefined) {
    if (!file) return;
    if (file.type.startsWith("image/")) stageImage(file);
    else setAttachments((a) => [...a, { id: nextId(), kind: "file", name: file.name || "file", file }]);
  }

  function removeAttachment(id: string) {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }

  async function handleSend() {
    if (!canSend) return;
    // process attachments first (sequentially — the vision route is one image
    // at a time), then the text turn.
    const imgs = attachments.filter((a) => a.kind === "image");
    const others = attachments.filter((a) => a.kind !== "image");
    setAttachments([]);
    for (const a of imgs) await onAttachImage(a.file);
    for (const a of others) onAttachUnsupported(a.file);
    const text = value.trim();
    if (text) (webMode ? onWebResearch(text) : onSend(text));
    // reset textarea height
    requestAnimationFrame(() => { if (taRef.current) taRef.current.style.height = "auto"; });
  }

  return (
    <div className="safe-bottom bg-shell/95 px-3 pb-2 pt-2.5 backdrop-blur">
      {/* staged attachment previews */}
      <div className="px-1">
        <AttachmentPreview items={attachments} onRemove={removeAttachment} />
      </div>

      {webMode && (
        <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-medium text-blu">
          <span className="h-1.5 w-1.5 rounded-full bg-blu" /> Web search on — I'll look beyond local data
        </div>
      )}

      <div className="relative flex items-end gap-2">
        {/* hidden pickers */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { onPicked(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={photosRef} type="file" accept="image/*" hidden
          onChange={(e) => { onPicked(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={filesRef} type="file" accept="image/*,application/pdf,.txt,.doc,.docx" hidden
          onChange={(e) => { onPicked(e.target.files?.[0]); e.target.value = ""; }} />

        {/* "+" button + floating menu. Attachments (Camera/Photos/Files) are
            Protector; Know Your Rights is for EVERYONE — rights are never
            gated — so free users get the + with just that entry. */}
        {(isPro || onKnowYourRights) && (
          <div className="relative shrink-0">
            <AttachmentMenu
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              onCamera={isPro ? () => cameraRef.current?.click() : undefined}
              onPhotos={isPro ? () => photosRef.current?.click() : undefined}
              onFiles={isPro ? () => filesRef.current?.click() : undefined}
              onKnowYourRights={onKnowYourRights}
            />
            <button
              onClick={() => setMenuOpen((v) => !v)}
              disabled={loading}
              aria-label="Add attachment"
              aria-expanded={menuOpen}
              className={`grid h-11 w-11 place-items-center rounded-full border border-ink/10 text-ink2 transition active:scale-95 disabled:opacity-60 ${menuOpen ? "rotate-45 bg-ink/10" : ""}`}
              style={{ transitionProperty: "transform, background-color" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
        )}

        {/* the pill */}
        <div className="flex min-w-0 flex-1 items-end gap-1.5 rounded-[22px] border border-ink/10 bg-card px-2 py-1 focus-within:border-brand/60">
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            onChange={(e) => { onChange(e.target.value); autoGrow(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder={placeholder}
            className="max-h-[140px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed outline-none placeholder:text-ink3"
          />

          {/* web toggle lives inside the pill, subtle, Pro only */}
          {isPro && (
            <button onClick={onToggleWeb} aria-label="Search the web" aria-pressed={webMode} title="Search the web"
              className={`mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full active:scale-95 ${webMode ? "bg-blu/15 text-blu" : "text-ink3"}`}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" /></svg>
            </button>
          )}

          {/* mic — speak-to-text: transcribes the user's audio into the text
              composer (distinct from the shield voice-conversation button) */}
          {isPro && (
            <button onClick={onToggleMic} aria-label={recording ? "Stop recording" : "Speak to type"} title="Speak to type"
              className={`mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full active:scale-95 ${recording ? "bg-brand text-white animate-pulse" : "text-ink2"}`}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10v1a7 7 0 0014 0v-1M12 18v4M8 22h8" /></svg>
            </button>
          )}
        </div>

        {/* far-right action: Send when there's something to send, else the
            shield voice-conversation button (Pro). Mirrors ChatGPT's swap. */}
        {canSend || !isPro ? (
          <button onClick={handleSend} disabled={!canSend} aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white transition active:scale-95 disabled:opacity-40">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          </button>
        ) : (
          <button onClick={onVoiceMode} aria-label="Voice conversation" title="Talk with CrimeAI"
            className="grid h-12 w-12 shrink-0 place-items-center self-stretch rounded-full bg-brand/12 text-brand transition active:scale-95">
            <svg width="34" height="40" viewBox="0 0 24 28" fill="currentColor"><path d="M12 1L3 4.5v7.5c0 5.4 3.8 10.5 9 12.4 5.2-1.9 9-7 9-12.4V4.5L12 1z" opacity="0.2" /><path d="M8 11v3M12 8.5v8M16 11v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
