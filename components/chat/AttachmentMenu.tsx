"use client";

// The "+" attachment menu — floats above the composer. CrimeAI tokens only.
// Exactly three actions: Camera, Photos, Files. Nothing else.
import { useEffect, useRef } from "react";
import { Camera, Image as ImageIcon } from "@/components/Icons";

function FileGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" />
    </svg>
  );
}

export interface AttachmentMenuProps {
  open: boolean;
  onClose: () => void;
  onCamera: () => void;
  onPhotos: () => void;
  onFiles: () => void;
}

export default function AttachmentMenu({ open, onClose, onCamera, onPhotos, onFiles }: AttachmentMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (!open) return null;

  const rows: [() => void, React.ReactNode, string, string][] = [
    [onCamera, <Camera size={19} key="c" />, "Camera", "Take a photo"],
    [onPhotos, <ImageIcon size={19} key="p" />, "Photos", "Choose from your library"],
    [onFiles, <FileGlyph key="f" />, "Files", "Attach a document"],
  ];

  return (
    <div ref={ref} role="menu" aria-label="Add attachment"
      className="composer-menu absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-2xl border border-ink/10 bg-card2 shadow-2xl">
      {rows.map(([fn, icon, label, sub], i) => (
        <button key={label} role="menuitem" onClick={() => { fn(); onClose(); }}
          className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-ink/10 ${i > 0 ? "border-t border-ink/5" : ""}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/12 text-brand">{icon}</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{label}</span>
            <span className="block text-[11px] text-ink3">{sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
