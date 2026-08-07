"use client";

// Honest per-source coverage for Miami (roadmap §5b.3.1 + §5.2 honesty).
// Citizen pretends it sees everything; we tell the user exactly what's
// live, delayed, or unavailable — that candor is the trust moat.
const ROWS = [
  { source: "Miami-Dade Open Data", status: "live", note: "Incident + dashboard data, refreshed regularly" },
  { source: "City of Miami portal", status: "live", note: "Developer portal feeds, growing coverage" },
  { source: "SpotCrime", status: "live", note: "Breadth layer across smaller jurisdictions" },
  { source: "Police scanner audio", status: "partial", note: "Miami-Dade is hybrid — some channels real-time" },
  { source: "LiveUAMap", status: "partial", note: "Major incidents only, minutes of latency" },
  { source: "Nextdoor / community", status: "unverified", note: "Lowest trust weight, shown as community reports" },
];

const COLORS: Record<string, { dot: string; label: string; text: string }> = {
  live: { dot: "#1b7f3a", label: "Live", text: "text-brand" },
  partial: { dot: "#d98a00", label: "Partial", text: "text-amber-400" },
  unverified: { dot: "#64748b", label: "Community", text: "text-ink2" },
};

export default function CoverageMatrix() {
  return (
    <div className="rounded-2xl border border-ink/10 bg-card/70 p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink2">Data coverage · Miami</h2>
      <p className="mb-3 text-xs text-ink3">We show you exactly what we can and can't see.</p>
      <div className="space-y-2">
        {ROWS.map((r) => {
          const c = COLORS[r.status];
          return (
            <div key={r.source} className="flex items-start gap-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: c.dot }} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink">{r.source}</span>
                  <span className={`text-[10px] font-semibold uppercase ${c.text}`}>{c.label}</span>
                </div>
                <p className="text-xs text-ink3">{r.note}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ⚠️ These are PUBLIC PROMISES shown to every user, and a published privacy
// representation. Every line must stay literally true of what the product
// actually does — if a data practice changes, this panel changes FIRST, not
// after. See DATA-GOVERNANCE.md.
//
// The distinction the first line draws is the important one and is not
// marketing: 1:1 verification (does this selfie match this person's OWN ID?)
// is a different act from 1:N identification (who is this stranger?). CrimeAI
// does the first and must never do the second — the second is the Clearview
// problem. Keeping the promise precise is what lets us keep making it.
export function TrustPanel() {
  const never = [
    "Identify a stranger from a photo — face matching only ever checks your own selfie against your own ID.",
    "Describe anyone's race or ethnicity in any output.",
    "Predict who will commit a crime.",
    "Sell your data to advertisers or data brokers.",
    "Give any agency standing, bulk or self-serve access to our data.",
  ];
  const identity = [
    "Your selfie, ID image and face scan are deleted within 24 hours of verification.",
    "We keep only the result — that you were verified, when, and by what method.",
    "Your biometric data never trains any AI model.",
    "We ask for your written consent first, and you can decline.",
  ];
  const sharing = [
    "Law enforcement gets your data only with a warrant, subpoena or court order — and we tell you unless a court bars us or someone is in immediate danger.",
    "Your posts and activity help train CrimeAI and Torr AI models. You can opt out in Settings.",
    "Every incident is traceable to its source and confidence.",
  ];

  const List = ({ items, mark }: { items: string[]; mark: string }) => (
    <ul className="space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-xs text-ink2">
          <span className="shrink-0 text-brand">{mark}</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4 rounded-2xl border border-brand/20 bg-brand/5 p-5">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-brand">What CrimeAI will never do</h2>
        <List items={never} mark="✓" />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-brand">Your identity check</h2>
        <List items={identity} mark="·" />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-brand">Who sees your data</h2>
        <List items={sharing} mark="·" />
      </div>
    </div>
  );
}
