"use client";

// Public web page for a legal document — the App Store and Play Store
// both require Privacy Policy / Terms URLs that live on the open web.
// Served from the deployed backend at /privacy and /terms.
import { useEffect, useState } from "react";
import { getLegalDocs, type LegalDoc } from "@/lib/legal";

export default function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  useEffect(() => {
    getLegalDocs().then((docs) => setDoc(docs.find((d) => d.kind === kind) || null)).catch(() => {});
  }, [kind]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="CrimeAI" width={40} height={40} className="rounded-lg" />
        <div>
          <h1 className="text-lg font-bold">{doc?.title || (kind === "terms" ? "CrimeAI Terms of Service" : "CrimeAI Privacy Policy")}</h1>
          <p className="text-xs text-ink3">Public Safety Crime Center · BlackSeed Labs / TORR AI</p>
        </div>
      </div>
      {doc
        ? <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-ink2">{doc.body}</pre>
        : <p className="py-10 text-sm text-ink3">Loading…</p>}
    </main>
  );
}
