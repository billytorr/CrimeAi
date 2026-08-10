"use client";

// Compact removable previews for staged attachments, above the input.
import { Close } from "@/components/Icons";

export interface Attachment {
  id: string;
  kind: "image" | "file";
  name: string;
  dataUrl?: string;   // image thumbnail
  file: File;
}

export default function AttachmentPreview({ items, onRemove }: { items: Attachment[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {items.map((a) => (
        <div key={a.id} className="relative flex items-center gap-2 rounded-xl border border-ink/10 bg-card px-2 py-1.5">
          {a.kind === "image" && a.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.dataUrl} alt={a.name} className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink/10 text-ink2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
            </span>
          )}
          <span className="max-w-[120px] truncate text-xs text-ink2">{a.name}</span>
          <button onClick={() => onRemove(a.id)} aria-label={`Remove ${a.name}`}
            className="grid h-5 w-5 place-items-center rounded-full bg-ink/15 text-ink active:scale-90">
            <Close size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
