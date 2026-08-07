// Pricing maths + shapes shared by the pricing page and the Command Center.
//
// The annual discount is DERIVED from the two live prices, never stored.
// A hardcoded "27% off" badge is right until someone edits a price in the
// admin portal, and then it is a false advertising claim nobody notices.

export type PlanStatus = "live" | "coming_soon" | "hidden";
export type Interval = "month" | "year";

export interface Plan {
  id: string;
  name: string;
  status: PlanStatus;
  tagline?: string;
  blurb?: string;
  features: string[];
  sortOrder: number;
  highlight: boolean;
}

export interface Price {
  id: string;
  planId: string;
  amountCents: number;
  interval: Interval;
  label?: string;
  active: boolean;
}

export const money = (cents: number): string =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

export interface AnnualSaving {
  /** what 12 months would cost at the monthly rate */
  monthlyTotalCents: number;
  savedCents: number;
  percentOff: number;
  /** whole months covered by the saving — "3 months free" */
  monthsFree: number;
}

/**
 * What switching to annual is worth. Returns null when the comparison isn't
 * meaningful — no monthly price, or an annual price that saves nothing.
 * Better to show no badge than "0% off".
 */
export function annualSaving(monthlyCents: number, annualCents: number): AnnualSaving | null {
  if (!monthlyCents || !annualCents) return null;
  const monthlyTotalCents = monthlyCents * 12;
  const savedCents = monthlyTotalCents - annualCents;
  if (savedCents <= 0) return null;
  return {
    monthlyTotalCents,
    savedCents,
    percentOff: Math.round((savedCents / monthlyTotalCents) * 100),
    // floor: claiming 3 months free when the saving covers 3.2 is honest;
    // rounding up to 4 is not.
    monthsFree: Math.floor(savedCents / monthlyCents),
  };
}

/** Annual price shown as a per-month figure, for a like-for-like comparison. */
export const perMonthFromAnnual = (annualCents: number): number => Math.round(annualCents / 12);

/** The price a plan charges for the chosen interval, if it has one. */
export function priceFor(prices: Price[], planId: string, interval: Interval): Price | undefined {
  return prices.find((p) => p.planId === planId && p.interval === interval && p.active);
}

export const rowToPlan = (r: any): Plan => ({
  id: r.id,
  name: r.name,
  status: (r.status || "live") as PlanStatus,
  tagline: r.tagline || undefined,
  blurb: r.blurb || undefined,
  features: Array.isArray(r.features) ? r.features : [],
  sortOrder: r.sort_order ?? 100,
  highlight: !!r.highlight,
});

export const rowToPrice = (r: any): Price => ({
  id: r.id,
  planId: r.plan_id,
  amountCents: r.amount_cents,
  interval: r.interval === "year" ? "year" : "month",
  label: r.label || undefined,
  active: r.active !== false,
});
