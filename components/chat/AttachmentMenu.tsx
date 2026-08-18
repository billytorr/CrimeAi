"use client";

// The "+" menu — floats above the composer. CrimeAI tokens only.
// Exactly four actions: Camera, Photos, Files, Know Your Rights. Nothing else.
import { useEffect, useRef } from "react";
import { Camera, Image as ImageIcon } from "@/components/Icons";

function ShieldGlyph() {
  return (
    <svg width="19" height="21" viewBox="0 0 24 28" fill="currentColor"><path d="M12 1L3 4.5v7.5c0 5.4 3.8 10.5 9 12.4 5.2-1.9 9-7 9-12.4V4.5L12 1z" opacity="0.25"/><path d="M12 2.6L4.4 5.5v6.5c0 4.6 3.2 9 7.6 10.6 4.4-1.6 7.6-6 7.6-10.6V5.5L12 2.6z" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M12 8v6M12 16.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  );
}

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
  onCamera?: () => void;
  onPhotos?: () => void;
  onFiles?: () => void;
  onKnowYourRights?: () => void; // starts the in-conversation rights flow
}

export default function AttachmentMenu({ open, onClose, onCamera, onPhotos, onFiles, onKnowYourRights }: AttachmentMenuProps) {
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

  type Row = [() => void, React.ReactNode, string, string];
  const rows: Row[] = [
    ...(onCamera ? [[onCamera, <Camera size={19} key="c" />, "Camera", "Take a photo"] as Row] : []),
    ...(onPhotos ? [[onPhotos, <ImageIcon size={19} key="p" />, "Photos", "Choose from your library"] as Row] : []),
    ...(onFiles ? [[onFiles, <FileGlyph key="f" />, "Files", "Attach a document"] as Row] : []),
    ...(onKnowYourRights ? [[onKnowYourRights, <ShieldGlyph key="k" />, "Know Your Rights", "Police, FBI, ICE — what to say"] as Row] : []),
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
