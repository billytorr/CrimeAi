"use client";

// Shared Command Center UI primitives.

export function StatCard({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "ok" | "warn" | "bad" }) {
  const t = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-brand" : "text-ink";
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink3">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${t}`}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink2">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "ok" | "warn" | "bad" | "blue" | "muted" }) {
  const c = {
    ok: "bg-ok/15 text-ok",
    warn: "bg-warn/15 text-warn",
    bad: "bg-brand/15 text-brand",
    blue: "bg-blu/15 text-blu",
    muted: "bg-white/5 text-ink2",
  }[tone];
  return <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>;
}

export function Spark({ data, height = 42 }: { data: { day: string; n: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const w = 100 / Math.max(1, data.length);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} title={`${d.day}: ${d.n}`} className="flex-1 rounded-t bg-brand/70" style={{ height: `${Math.max(4, (d.n / max) * 100)}%`, minWidth: w }} />
      ))}
    </div>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink3">{children}</th>;
}
export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 text-sm ${className}`}>{children}</td>;
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Btn({ children, onClick, tone = "default", small, disabled }: { children: React.ReactNode; onClick?: () => void; tone?: "default" | "brand" | "danger" | "ok"; small?: boolean; disabled?: boolean }) {
  const c = {
    default: "border border-line bg-card2 text-ink hover:bg-white/10",
    brand: "bg-brand text-white hover:opacity-90",
    danger: "bg-brand/15 text-brand border border-brand/30 hover:bg-brand/25",
    ok: "bg-ok/15 text-ok border border-ok/30 hover:bg-ok/25",
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-lg font-semibold transition disabled:opacity-50 ${small ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"} ${c}`}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-lg border border-line bg-card2 px-3 py-2 text-sm outline-none placeholder:text-ink3 focus:border-brand/60 ${props.className || ""}`} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full resize-none rounded-lg border border-line bg-card2 px-3 py-2 text-sm outline-none placeholder:text-ink3 focus:border-brand/60 ${props.className || ""}`} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`rounded-lg border border-line bg-card2 px-2.5 py-2 text-sm outline-none focus:border-brand/60 ${props.className || ""}`} />;
}
