"use client";

// The plan comparison chart.
//
// Everything here is config — plan names, copy, features, prices and the
// coming-soon state all come from tier_plans / tier_prices, so the Command
// Center changes what this shows without a deploy.
//
// The annual discount is COMPUTED from the two live prices (see
// lib/pricing.ts). A hardcoded badge goes stale the moment someone edits a
// price in the admin portal, and a stale discount claim is a false one.

import { useEffect, useState } from "react";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import {
  annualSaving, money, perMonthFromAnnual, priceFor, rowToPlan, rowToPrice,
  type Interval, type Plan, type Price,
} from "@/lib/pricing";
import { ProBadge } from "@/components/Icons";

export default function PlanComparison({
  currentPlanId, onChoose, busyPriceId,
}: {
  currentPlanId?: string;
  /** Called with the chosen price. Coming-soon plans never call this. */
  onChoose?: (price: Price) => void;
  busyPriceId?: string | null;
}) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [interval, setInterval] = useState<Interval>("month");

  useEffect(() => {
    if (!supabaseEnabled) { setPlans([]); return; }
    (async () => {
      const [{ data: pl }, { data: pr }] = await Promise.all([
        supabase!.from("tier_plans").select("*").eq("active", true).neq("status", "hidden").order("sort_order"),
        supabase!.from("tier_prices").select("*").eq("active", true),
      ]);
      setPlans((pl || []).map(rowToPlan));
      setPrices((pr || []).map(rowToPrice));
    })();
  }, []);

  if (plans === null) return <div className="py-10 text-center text-sm text-ink3">Loading plans…</div>;
  if (!plans.length) return null;

  const monthly = priceFor(prices, "pro", "month");
  const annual = priceFor(prices, "pro", "year");
  const saving = monthly && annual ? annualSaving(monthly.amountCents, annual.amountCents) : null;

  return (
    <div>
      {/* Only offer the toggle when there is genuinely a choice to make. */}
      {monthly && annual && (
        <div className="mb-4">
          <div className="flex rounded-xl border border-ink/10 bg-shell p-1">
            {(["month", "year"] as const).map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                  interval === i ? "bg-brand text-white" : "text-ink2"
                }`}
              >
                {i === "month" ? "Monthly" : "Annual"}
                {i === "year" && saving && (
                  <span className={interval === "year" ? "text-white/85" : "text-brand"}> · save {saving.percentOff}%</span>
                )}
              </button>
            ))}
          </div>
          {interval === "year" && saving && (
            <p className="mt-2 text-center text-[11px] text-ink3">
              {money(annual!.amountCents)} billed yearly — that&apos;s {money(perMonthFromAnnual(annual!.amountCents))}/mo,
              about <strong className="text-ink2">{saving.monthsFree} month{saving.monthsFree === 1 ? "" : "s"} free</strong> versus{" "}
              {money(monthly!.amountCents)}/mo.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            price={priceFor(prices, plan.id, interval)}
            interval={interval}
            saving={plan.id === "pro" ? saving : null}
            isCurrent={plan.id === currentPlanId}
            busy={!!busyPriceId && busyPriceId === priceFor(prices, plan.id, interval)?.id}
            onChoose={onChoose}
          />
        ))}
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-ink3">
        Every safety feature — SOS, trusted circle, one-tap 911 — works on every plan, including Free. Paid plans never
        gate an emergency.
      </p>
    </div>
  );
}

function PlanCard({
  plan, price, interval, saving, isCurrent, busy, onChoose,
}: {
  plan: Plan; price?: Price; interval: Interval;
  saving: ReturnType<typeof annualSaving>;
  isCurrent: boolean; busy: boolean;
  onChoose?: (p: Price) => void;
}) {
  const soon = plan.status === "coming_soon";

  return (
    <div className={`rounded-2xl border p-4 ${
      plan.highlight && !soon ? "border-brand/40 bg-brand/5" : "border-ink/10 bg-card"
    } ${soon ? "opacity-75" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-base font-bold text-ink">{plan.name}</h3>
            {plan.id === "pro" && <ProBadge size={14} />}
            {soon && (
              <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink2">
                Coming soon
              </span>
            )}
            {isCurrent && !soon && (
              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand">Your plan</span>
            )}
          </div>
          {plan.tagline && <p className="mt-0.5 text-xs text-ink2">{plan.tagline}</p>}
        </div>

        <div className="shrink-0 text-right">
          {soon ? (
            <span className="text-sm font-semibold text-ink3">TBD</span>
          ) : price ? (
            <>
              <div className="text-lg font-bold leading-none text-ink">
                {interval === "year" ? money(perMonthFromAnnual(price.amountCents)) : money(price.amountCents)}
                <span className="text-xs font-medium text-ink3">/mo</span>
              </div>
              {interval === "year" && (
                <div className="mt-0.5 text-[10px] text-ink3">{money(price.amountCents)} billed yearly</div>
              )}
            </>
          ) : (
            <span className="text-lg font-bold text-ink">Free</span>
          )}
        </div>
      </div>

      {plan.blurb && <p className="mt-2.5 text-xs leading-relaxed text-ink2">{plan.blurb}</p>}

      {plan.features.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-2 text-xs text-ink2">
              <span className="text-brand">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {soon ? (
        <p className="mt-3.5 rounded-lg bg-ink/5 px-3 py-2 text-[11px] leading-relaxed text-ink3">
          We&apos;re designing this one with you. Features and price come from what Protectors ask for after launch —
          tell us what you need in Settings → Send feedback.
        </p>
      ) : price && onChoose && !isCurrent ? (
        <button
          onClick={() => onChoose(price)}
          disabled={busy}
          className="mt-3.5 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? "Opening checkout…" : interval === "year"
            ? `Get ${plan.name} — ${money(price.amountCents)}/yr`
            : `Get ${plan.name} — ${money(price.amountCents)}/mo`}
        </button>
      ) : null}

      {!soon && price && saving && interval === "month" && (
        <p className="mt-2 text-center text-[11px] text-ink3">
          Save {saving.percentOff}% with annual billing
        </p>
      )}
    </div>
  );
}
