"use client";

// Branded Protector checkout on pay.publicsafetycrimecenter.com. Card data
// is tokenized IN THE BROWSER by Accept.js and sent straight to
// Authorize.Net — it never touches our servers (Rule 8, SAQ A). We only
// ever see the opaque nonce. Visually matches the app so the domain change
// isn't a trust drop.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { apiUrl } from "@/lib/api";

declare global { interface Window { Accept?: any } }

interface Validated {
  valid: boolean;
  amountCents?: number;
  priceId?: string;
  descriptor?: string;
  accept?: { env: string; apiLoginId: string; clientKey: string; acceptJsUrl: string };
  reason?: string;
}

function Checkout() {
  const params = useSearchParams();
  const token = params.get("t") || "";
  const [info, setInfo] = useState<Validated | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [card, setCard] = useState({ number: "", exp: "", cvv: "", name: "", zip: "" });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setInfo({ valid: false, reason: "missing" }); return; }
    fetch(apiUrl(`/api/pay/authnet/validate?t=${encodeURIComponent(token)}`))
      .then((r) => r.json()).then(setInfo).catch(() => setInfo({ valid: false, reason: "error" }));
  }, [token]);

  // load Accept.js from the env-correct URL once we know it
  useEffect(() => {
    const url = info?.accept?.acceptJsUrl;
    if (!url) return;
    if (window.Accept) { setScriptReady(true); return; }
    const s = document.createElement("script");
    s.src = url; s.async = true;
    s.onload = () => setScriptReady(true);
    s.onerror = () => setError("Couldn't load the secure payment library. Refresh and try again.");
    document.head.appendChild(s);
  }, [info?.accept?.acceptJsUrl]);

  const price = useMemo(() => info?.amountCents ? `$${(info.amountCents / 100).toFixed(2)}` : "", [info]);

  function pay() {
    setError("");
    const acc = info?.accept;
    if (!window.Accept || !acc) { setError("Payment library not ready yet."); return; }
    const [mm, yy] = card.exp.split("/").map((s) => s.trim());
    if (!card.number || !mm || !yy || !card.cvv) { setError("Enter your card details."); return; }
    setBusy(true);
    window.Accept.dispatchData(
      { authData: { clientKey: acc.clientKey, apiLoginID: acc.apiLoginId }, cardData: { cardNumber: card.number.replace(/\s/g, ""), month: mm, year: yy.length === 2 ? `20${yy}` : yy, cardCode: card.cvv, zip: card.zip, fullName: card.name } },
      async (resp: any) => {
        if (resp.messages.resultCode !== "Ok") {
          setBusy(false);
          setError(resp.messages.message?.[0]?.text || "Please check your card details.");
          return;
        }
        try {
          const r = await fetch(apiUrl("/api/pay/authnet/subscribe"), {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, opaque: resp.opaqueData, email, name: card.name }),
          });
          const d = await r.json();
          if (!r.ok) {
            throw new Error(d.retryable
              ? "The payment network is taking longer than usual. Your card was NOT charged — wait ~30 seconds and tap Subscribe again."
              : d.error || "Could not complete checkout.");
          }
          setDone(true);
          if (d.returnTo) setTimeout(() => { window.location.href = d.returnTo; }, 2200);
        } catch (e) {
          setError((e as Error).message);
        } finally { setBusy(false); }
      },
    );
  }

  if (!info) return <Shell><p className="py-16 text-center text-sm text-ink3">Loading…</p></Shell>;
  if (!info.valid) return (
    <Shell>
      <div className="mt-8 rounded-2xl border border-ink/10 bg-card p-5 text-center">
        <p className="text-sm font-semibold">This checkout link isn&apos;t valid</p>
        <p className="mt-1 text-xs text-ink3">Open the Protector upgrade again from the CrimeAI app to get a fresh, secure link.</p>
      </div>
    </Shell>
  );

  if (done) return (
    <Shell>
      <div className="mt-8 rounded-2xl border border-green-500/30 bg-green-500/10 p-6 text-center">
        <p className="text-base font-semibold text-green-500">You&apos;re a Protector 🛡️</p>
        <p className="mt-2 text-xs text-ink2">Your red Protector badge is now active. Taking you back to CrimeAI…</p>
      </div>
    </Shell>
  );

  return (
    <Shell>
      <div className="mt-6 rounded-2xl border border-ink/10 bg-card p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">CrimeAI Protector</span>
          <span className="text-2xl font-bold">{price}<span className="text-sm font-normal text-ink3">/mo</span></span>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs text-ink2">
          <li>· Red Protector badge on your profile & posts</li>
          <li>· 90-day map history, saved locations, wider alerts</li>
          <li>· Address search, SMS alerts, full Safety Score</li>
        </ul>
      </div>

      <div className="mt-4 space-y-2.5">
        <Field label="Email for receipt" value={email} onChange={setEmail} placeholder="you@email.com" type="email" />
        <Field label="Card number" value={card.number} onChange={(v) => setCard({ ...card, number: v })} placeholder="1234 5678 9012 3456" inputMode="numeric" />
        <div className="flex gap-2.5">
          <Field label="Expiry" value={card.exp} onChange={(v) => setCard({ ...card, exp: v })} placeholder="MM/YY" />
          <Field label="CVV" value={card.cvv} onChange={(v) => setCard({ ...card, cvv: v })} placeholder="123" inputMode="numeric" />
          <Field label="ZIP" value={card.zip} onChange={(v) => setCard({ ...card, zip: v })} placeholder="33131" inputMode="numeric" />
        </div>
        <Field label="Name on card" value={card.name} onChange={(v) => setCard({ ...card, name: v })} placeholder="Maria López" />
      </div>

      {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
      <button onClick={pay} disabled={busy || !scriptReady}
        className="mt-5 w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-60">
        {busy ? "Processing securely…" : scriptReady ? `Subscribe — ${price}/mo` : "Loading secure checkout…"}
      </button>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-ink3">
        Cancel anytime. Card details are encrypted by our payment processor and never touch CrimeAI servers.
        Your statement will show <span className="font-medium text-ink2">{info.descriptor}</span>.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex flex-col items-center text-center">
        <Logo size={52} />
        <h1 className="mt-3 text-xl font-bold">Become a Protector</h1>
        <p className="mt-1 text-xs text-ink2">Public Safety Crime Center</p>
      </div>
      {children}
      <p className="mt-auto pt-8 text-center text-[11px] text-ink3">Secured by Authorize.Net · BlackSeed Labs / TORR AI</p>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; inputMode?: "numeric" }) {
  return (
    <label className="block flex-1">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink2">{label}</span>
      <input type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border border-ink/10 bg-shell px-3.5 py-3 text-base outline-none placeholder:text-ink3 focus:border-brand/60" />
    </label>
  );
}

export default function CheckoutPage() {
  return <Suspense fallback={<p className="py-16 text-center text-sm text-ink3">Loading…</p>}><Checkout /></Suspense>;
}
