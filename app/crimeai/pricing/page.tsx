"use client";

// Public pricing page — /crimeai/pricing
//
// Opened from the app in the DEVICE'S BROWSER, not an in-app webview: an
// external purchase must happen outside the app to stay clear of the store
// in-app-purchase rules, and a real browser is also where a customer can see
// the padlock and the domain they're paying.
//
// With `?t=<checkout token>` it becomes a buying flow: pick a plan, pick
// monthly or annual, go to checkout. Without one it's a plain marketing page
// that anyone can read — the same component either way, so the prices a
// visitor sees are the prices they're charged.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import {
  annualSaving, money, perMonthFromAnnual, priceFor, rowToPlan, rowToPrice,
  type Interval, type Plan, type Price,
} from "@/lib/pricing";
import { apiUrl } from "@/lib/api";
import Logo from "@/components/Logo";
import { ProBadge } from "@/components/Icons";

export default function PricingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-shell" />}>
      <Pricing />
    </Suspense>
  );
}

function Pricing() {
  const params = useSearchParams();
  const token = params.get("t") || "";
  // Display only — the server is the authority on what anyone is entitled to.
  const currentPlanId = params.get("current") || "";
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [interval, setInterval] = useState<Interval>("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabaseEnabled) { setPlans([]); return; }
    (async () => {
      const [{ data: pl }, { data: pr }] = await Promise.all([
        supabase!.from("tier_plans").select("*").eq("active", true),
        supabase!.from("tier_prices").select("*").eq("active", true),
      ]);
      setPlans(
        (pl || []).map(rowToPlan).filter((p) => p.status !== "hidden")
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      );
      setPrices((pr || []).map(rowToPrice));
    })();
  }, []);

  // The token the app minted is bound to ONE price. Exchange it for the plan
  // actually chosen here, then hand off to checkout.
  const choose = useCallback(async (price: Price) => {
    // A subscription has to attach to an account, so without a token we send
    // them to the app to sign in rather than into a checkout that can't
    // complete. `next` brings them back to the plan they picked.
    if (!token) {
      const appBase = process.env.NEXT_PUBLIC_APP_BASE || "https://app.publicsafetycrimecenter.com";
      window.location.href = `${appBase}/?upgrade=${encodeURIComponent(price.id)}`;
      return;
    }
    setBusy(price.id); setError("");
    try {
      const r = await fetch(apiUrl("/api/pay/authnet/retoken"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, priceId: price.id }),
      });
      const d = await r.json();
      if (!r.ok || !d.token) throw new Error(d.error || "Could not start checkout.");
      // `app=1` rides along when the page was opened from the native app's
      // in-app browser, so the success screen can deep-link back into the app.
      const fromApp = params.get("app") === "1" ? "&app=1" : "";
      window.location.href = `/crimeai/pricing/checkout?t=${encodeURIComponent(d.token)}${fromApp}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }, [token]);

  const monthly = priceFor(prices, "pro", "month");
  const annual = priceFor(prices, "pro", "year");
  const saving = monthly && annual ? annualSaving(monthly.amountCents, annual.amountCents) : null;

  return (
    <div className="min-h-screen bg-shell">
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-10">
        <header className="flex flex-col items-center text-center">
          <Logo size={44} />
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Pick your plan</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink2">
            CrimeAI is free to use, always. Paid plans widen your alert radius and go deeper on the data — they never
            gate a safety feature.
          </p>
        </header>

        {monthly && annual && (
          <div className="mx-auto mt-7 max-w-xs">
            <div className="flex rounded-full border border-ink/10 bg-card p-1">
              {(["month", "year"] as const).map((i) => (
                <button
                  key={i}
                  onClick={() => setInterval(i)}
                  className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                    interval === i ? "bg-brand text-white" : "text-ink2"
                  }`}
                >
                  {i === "month" ? "Monthly" : "Annual"}
                </button>
              ))}
            </div>
            {saving && (
              <p className="mt-2 text-center text-xs text-ink3">
                {interval === "year" ? (
                  <>
                    {money(annual.amountCents)} a year — {money(perMonthFromAnnual(annual.amountCents))}/mo, about{" "}
                    <strong className="text-brand">{saving.monthsFree} months free</strong>
                  </>
                ) : (
                  <>Switch to annual and <strong className="text-brand">save {saving.percentOff}%</strong></>
                )}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="mx-auto mt-5 max-w-md rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-center text-sm text-danger">
            {error}
          </p>
        )}

        {plans === null ? (
          <p className="py-20 text-center text-sm text-ink3">Loading plans…</p>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                plan={plan}
                price={priceFor(prices, plan.id, interval)}
                interval={interval}
                percentOff={plan.id === "pro" && interval === "year" ? saving?.percentOff : undefined}
                isCurrent={plan.id === currentPlanId}
                busy={busy === priceFor(prices, plan.id, interval)?.id}
                onChoose={choose}
              />
            ))}
          </div>
        )}

        <section className="mt-12 rounded-2xl border border-ink/10 bg-card p-5">
          <h2 className="text-sm font-bold text-ink">Free on every plan, including Free</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-ink2">
            SOS · &quot;I&apos;m not safe&quot; · Walk-with-me · one-tap 911 · Trusted Circle dispatch · critical alerts.
            A safety feature is never behind a paywall, and a billing problem can never switch one off.
          </p>
        </section>

        <footer className="mt-8 space-y-1.5 text-center text-[11px] text-ink3">
          <p>Secure checkout on publicsafetycrimecenter.com. Cancel any time from the app.</p>
          <p>Card details go straight to our payment processor — CrimeAI never sees or stores your card number.</p>
        </footer>
      </div>
    </div>
  );
}

function Card({
  plan, price, interval, percentOff, isCurrent, busy, onChoose,
}: {
  plan: Plan; price?: Price; interval: Interval; percentOff?: number;
  isCurrent?: boolean; busy: boolean; onChoose: (p: Price) => void;
}) {
  const soon = plan.status === "coming_soon";
  const featured = plan.highlight && !soon;

  return (
    <div className={`relative flex flex-col rounded-2xl border p-5 ${
      featured ? "border-brand/50 bg-brand/5 shadow-lg shadow-brand/5" : "border-ink/10 bg-card"
    } ${soon ? "opacity-70" : ""}`}>
      {featured && (
        <span className="absolute -top-2.5 left-5 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Most popular
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <h3 className="text-lg font-bold text-ink">{plan.name}</h3>
        {plan.id === "pro" && <ProBadge size={15} />}
        {isCurrent && (
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand">Your plan</span>
        )}
      </div>
      {plan.tagline && <p className="mt-1 text-xs leading-relaxed text-ink2">{plan.tagline}</p>}

      <div className="mt-4 min-h-[54px]">
        {soon ? (
          <span className="inline-block rounded-full bg-ink/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink2">
            Coming soon
          </span>
        ) : price ? (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold leading-none text-ink">
                {interval === "year" ? money(perMonthFromAnnual(price.amountCents)) : money(price.amountCents)}
              </span>
              <span className="text-xs text-ink3">/month</span>
            </div>
            <p className="mt-1 text-[11px] text-ink3">
              {interval === "year"
                ? <>{money(price.amountCents)} billed yearly{percentOff ? ` · save ${percentOff}%` : ""}</>
                : "billed monthly"}
            </p>
          </>
        ) : (
          <span className="text-3xl font-bold leading-none text-ink">Free</span>
        )}
      </div>

      {plan.blurb && <p className="mt-3 text-xs leading-relaxed text-ink2">{plan.blurb}</p>}

      {plan.features.length > 0 && (
        <ul className="mt-4 flex-1 space-y-2">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-2 text-xs text-ink2">
              <span className="shrink-0 text-brand">✓</span><span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      {!plan.features.length && <div className="flex-1" />}

      <div className="mt-5">
        {soon ? (
          <p className="rounded-lg bg-ink/5 px-3 py-2.5 text-[11px] leading-relaxed text-ink3">
            We&apos;re designing this with you. Features and price come from what members ask for after launch.
          </p>
        ) : isCurrent ? (
          <div className="w-full rounded-xl border border-brand/30 bg-brand/5 py-3 text-center text-sm font-semibold text-brand">
            Your current plan
          </div>
        ) : price ? (
          <button
            onClick={() => onChoose(price)}
            disabled={busy}
            className={`w-full rounded-xl py-3 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50 ${
              featured ? "bg-brand text-white" : "border border-ink/20 text-ink"
            }`}
          >
            {busy ? "Starting…" : "Subscribe to this plan"}
          </button>
        ) : (
          <div className="w-full rounded-xl border border-ink/10 py-3 text-center text-sm font-semibold text-ink3">
            Your current plan
          </div>
        )}
      </div>
    </div>
  );
}
