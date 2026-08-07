"use client";

// Public pricing page — /crimeai/pricing
//
// Renders the SAME PlanComparison the app shows in Settings, so the two can
// never drift apart. No sign-in required: someone deciding whether to join
// should be able to see what things cost first.
//
// There is no buy button here on purpose. Checkout needs an authenticated
// session to mint its signed token, so this sends people into the app rather
// than dead-ending them at a login wall mid-purchase.

import PlanComparison from "@/components/PlanComparison";
import Logo from "@/components/Logo";

export default function PricingPage() {
  const appBase = process.env.NEXT_PUBLIC_APP_BASE || "https://app.publicsafetycrimecenter.com";

  return (
    <div className="min-h-screen bg-shell">
      <div className="mx-auto max-w-md px-5 pb-16 pt-10">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size={44} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Plans &amp; pricing</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink2">
            CrimeAI is free to use. Paid plans widen your radius and go deeper on the data — they never gate a safety
            feature.
          </p>
        </div>

        <PlanComparison />

        <div className="mt-8 text-center">
          <a
            href={appBase}
            className="inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white active:scale-[0.99]"
          >
            Open CrimeAI →
          </a>
          <p className="mt-3 text-[11px] text-ink3">Upgrade from Settings → Protector Plan once you&apos;re signed in.</p>
        </div>
      </div>
    </div>
  );
}
