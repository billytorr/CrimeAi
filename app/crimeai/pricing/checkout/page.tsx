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
import { googlePayAvailable, payWithGoogle, type GooglePayResult } from "@/lib/pay/googlepay";
import { GooglePayButton, ApplePayButton } from "@/components/WalletButtons";

declare global { interface Window { Accept?: any } }

interface Validated {
  valid: boolean;
  amountCents?: number;
  interval?: "month" | "year";
  priceId?: string;
  descriptor?: string;
  accept?: { env: string; apiLoginId: string; clientKey: string; acceptJsUrl: string };
  reason?: string;
}

function Checkout() {
  const params = useSearchParams();
  const token = params.get("t") || "";
  const fromApp = params.get("app") === "1";
  const [info, setInfo] = useState<Validated | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [card, setCard] = useState({ number: "", exp: "", cvv: "", name: "", zip: "" });
  // Billing address enables AVS at the issuer. The ZIP alone was being
  // collected and discarded; a full address means fewer false declines on
  // good cards and firmer ground in a chargeback dispute.
  const [bill, setBill] = useState({ address: "", city: "", state: "", country: "US" });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [gpayReady, setGpayReady] = useState(false);

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
  const per = info?.interval === "year" ? "/yr" : "/mo";
  const billedEvery = info?.interval === "year" ? "billed once a year" : "billed every month";

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
            body: JSON.stringify({
                token, opaque: resp.opaqueData, email, name: card.name,
                billing: { ...bill, zip: card.zip },
              }),
          });
          const d = await r.json();
          if (!r.ok) {
            throw new Error(d.retryable
              ? "The payment network is taking longer than usual. Your card was NOT charged — wait ~30 seconds and tap Subscribe again."
              : d.error || "Could not complete checkout.");
          }
          setDone(true);
          if (d.returnTo && !fromApp) setTimeout(() => { window.location.href = d.returnTo; }, 2200);
        } catch (e) {
          setError((e as Error).message);
        } finally { setBusy(false); }
      },
    );
  }

  // Google Pay's gatewayMerchantId is the Authorize.Net API Login ID, which
  // validate already returns as public Accept.js config — no new env var.
  const gatewayMerchantId = info?.accept?.apiLoginId || "";
  useEffect(() => {
    if (!gatewayMerchantId) return;
    googlePayAvailable(gatewayMerchantId).then(setGpayReady);
  }, [gatewayMerchantId]);

  async function payGoogle() {
    if (busy) return;
    setError(""); setBusy(true);
    try {
      const res: GooglePayResult | null = await payWithGoogle({
        gatewayMerchantId,
        amountCents: info?.amountCents || 0,
        label: `CrimeAI Protector ${info?.interval === "year" ? "(yearly)" : "(monthly)"}`,
      });
      if (!res) { setBusy(false); return; }   // user closed the sheet
      // The SAME endpoint the card path uses. The wallet only swaps the
      // token, so the charge, the ARB schedule and the period maths are the
      // ones already proven. Its address is issuer-verified, so prefer it.
      const r = await fetch(apiUrl("/api/pay/authnet/subscribe"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, opaque: res.opaque,
          email: res.email || email,
          name: res.billing.name || card.name,
          billing: res.billing,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not complete checkout.");
      setDone(true);
      if (d.returnTo && !fromApp) setTimeout(() => { window.location.href = d.returnTo; }, 2200);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
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
        {fromApp && (
          // Opened from the native app's in-app browser: bounce back via the
          // crimeai:// deep link so the app closes this sheet and confirms the
          // entitlement immediately. Auto-attempt + a manual button fallback.
          <a href="crimeai://checkout-return"
            className="mt-4 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white">
            Return to CrimeAI
          </a>
        )}
      </div>
      {fromApp && <AutoReturn />}
    </Shell>
  );

  return (
    <Shell>
      <div className="mt-6 rounded-2xl border border-ink/10 bg-card p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">CrimeAI Protector</span>
          <span className="text-2xl font-bold">{price}<span className="text-sm font-normal text-ink3">{per}</span></span>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs text-ink2">
          <li>· Red Protector badge on your profile & posts</li>
          <li>· 90-day map history, saved locations, wider alerts</li>
          <li>· Address search, SMS alerts, full Safety Score</li>
        </ul>
      </div>

      <div className="mt-4 space-y-2.5">
        {/* Wallets first — they're the fastest path and carry an
            issuer-verified billing address. Apple Pay is present but disabled
            until its certificates exist (see components/WalletButtons.tsx). */}
        <div className="space-y-2">
          {gpayReady && <GooglePayButton onClick={payGoogle} busy={busy} />}
          <ApplePayButton />
        </div>
        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-ink/10" />
          <span className="text-[11px] uppercase tracking-wide text-ink3">or pay by card</span>
          <span className="h-px flex-1 bg-ink/10" />
        </div>
        <Field label="Email for receipt" value={email} onChange={setEmail} placeholder="you@email.com" type="email" />
        <Field label="Card number" value={card.number} onChange={(v) => setCard({ ...card, number: v })} placeholder="1234 5678 9012 3456" inputMode="numeric" />
        <div className="flex gap-2.5">
          <Field label="Expiry" value={card.exp} onChange={(v) => setCard({ ...card, exp: v })} placeholder="MM/YY" />
          <Field label="CVV" value={card.cvv} onChange={(v) => setCard({ ...card, cvv: v })} placeholder="123" inputMode="numeric" />
          <Field label="ZIP" value={card.zip} onChange={(v) => setCard({ ...card, zip: v })} placeholder="33131" inputMode="numeric" />
        </div>
        <Field label="Name on card" value={card.name} onChange={(v) => setCard({ ...card, name: v })} placeholder="Maria López" />
        <div className="pt-1 text-xs font-medium uppercase tracking-wide text-ink2">Billing address</div>
        <Field label="Street address" value={bill.address} onChange={(v) => setBill({ ...bill, address: v })} placeholder="1200 Brickell Ave" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" value={bill.city} onChange={(v) => setBill({ ...bill, city: v })} placeholder="Miami" />
          <Field label="State" value={bill.state} onChange={(v) => setBill({ ...bill, state: v })} placeholder="FL" />
        </div>
      </div>

      {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
      <button onClick={pay} disabled={busy || !scriptReady}
        className="mt-5 w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-60">
        {busy ? "Processing securely…" : scriptReady ? `Subscribe — ${price}${per}` : "Loading secure checkout…"}
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

// Fires the crimeai:// return link shortly after success renders — the manual
// button above stays as the fallback if the OS swallows the auto-attempt.
function AutoReturn() {
  useEffect(() => {
    const t = setTimeout(() => { window.location.href = "crimeai://checkout-return"; }, 1200);
    return () => clearTimeout(t);
  }, []);
  return null;
}
