"use client";

// Protector Plan checkout — served at pay.publicsafetycrimecenter.com/crimeai/checkout
// (web checkout keeps app-store commissions out of the picture). The page
// is merchant-agnostic: it hands off to whichever provider is active.
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { apiUrl } from "@/lib/api";

interface PayStatus {
  provider: string;
  ready: boolean;
  plan: { name: string; price_cents: number; tagline: string; features: string[] } | null;
}

function Checkout() {
  const params = useSearchParams();
  const uid = params.get("uid") || "";
  const email = params.get("email") || "";
  const done = params.get("done") === "1";
  const canceled = params.get("canceled") === "1";

  const [status, setStatus] = useState<PayStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(apiUrl("/api/pay/status")).then((r) => r.json()).then(setStatus).catch(() => setStatus({ provider: "none", ready: false, plan: null }));
  }, []);

  async function pay() {
    setBusy(true); setError("");
    try {
      const r = await fetch(apiUrl("/api/pay/create-session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, email }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not start checkout.");
      window.location.href = d.url; // → merchant's secure hosted payment page
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const price = status?.plan ? `$${(status.plan.price_cents / 100).toFixed(2)}` : "$9.11";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex flex-col items-center text-center">
        <Logo size={56} />
        <h1 className="mt-4 text-2xl font-bold">
          {done ? "Welcome, Protector." : status?.plan?.name || "Protector Plan"}
        </h1>
        {!done && <p className="mt-1 text-sm text-ink2">{status?.plan?.tagline || "For the neighbors who keep the block safe"}</p>}
      </div>

      {done ? (
        <div className="mt-8 rounded-2xl border border-green-500/30 bg-green-500/10 p-5 text-center">
          <p className="text-sm font-semibold text-green-500">Payment complete — your Protector badge is live.</p>
          <p className="mt-2 text-xs text-ink2">Head back to the CrimeAI app. Your red verification badge now shows on your profile and every post.</p>
        </div>
      ) : (
        <>
          <div className="mt-8 rounded-2xl border border-ink/10 bg-card p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">CrimeAI Protector</span>
              <span className="text-2xl font-bold">{price}<span className="text-sm font-normal text-ink3">/mo</span></span>
            </div>
            <ul className="mt-4 space-y-2.5">
              {(status?.plan?.features || [
                "Red Protector badge on your profile and posts",
                "Priority visibility for your reports",
                "Extended alert radius",
                "Early access to new safety features",
              ]).map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink2">
                  <span className="mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {canceled && <p className="mt-4 text-center text-xs text-warn">Checkout canceled — no charge was made.</p>}
          {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}

          {status && !status.ready ? (
            <div className="mt-6 rounded-xl border border-ink/10 bg-ink/5 p-4 text-center">
              <p className="text-sm font-semibold">Payments are launching soon</p>
              <p className="mt-1 text-xs text-ink3">The Protector Plan isn&apos;t open for purchase quite yet. Check back shortly.</p>
            </div>
          ) : (
            <button
              onClick={pay}
              disabled={busy || !uid || !status}
              className="mt-6 w-full rounded-xl bg-brand py-4 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? "Redirecting to secure payment…" : `Continue to secure payment — ${price}/mo`}
            </button>
          )}
          {!uid && <p className="mt-3 text-center text-xs text-ink3">Open this page from the CrimeAI app (Settings → Protector Plan) so we know which account to upgrade.</p>}
          <p className="mt-4 text-center text-[11px] leading-relaxed text-ink3">
            Cancel anytime. Payments are processed by our secure payment partner — card details never touch CrimeAI servers.
          </p>
        </>
      )}
      <p className="mt-auto pt-8 text-center text-[11px] text-ink3">Public Safety Crime Center · BlackSeed Labs / TORR AI</p>
    </main>
  );
}

export default function CheckoutPage() {
  return <Suspense fallback={<p className="py-16 text-center text-sm text-ink3">Loading…</p>}><Checkout /></Suspense>;
}
