import { describe, it, expect } from "vitest";
import { annualSaving, perMonthFromAnnual, money, priceFor, type Price } from "@/lib/pricing";

// The annual discount is DERIVED, never stored. A hardcoded "27% off" badge
// is correct right up until someone edits a price in the Command Center, and
// then it is a false advertising claim that nobody notices.
describe("annualSaving", () => {
  it("computes the real numbers for $7.99/mo vs $69.99/yr", () => {
    const s = annualSaving(799, 6999)!;
    expect(s.monthlyTotalCents).toBe(9588);   // 12 × 7.99
    expect(s.savedCents).toBe(2589);          // 95.88 − 69.99
    expect(s.percentOff).toBe(27);
    expect(s.monthsFree).toBe(3);             // 25.89 / 7.99 = 3.24
  });

  it("FLOORS months free — 3.24 months saved is '3 months free', not 4", () => {
    // Rounding up would overstate the offer in the customer's disfavour.
    expect(annualSaving(799, 6999)!.monthsFree).toBe(3);
    expect(annualSaving(1000, 11500)!.monthsFree).toBe(0); // saves 5.00, under one month
  });

  it("returns null when annual saves nothing — show no badge over '0% off'", () => {
    expect(annualSaving(799, 9588)).toBeNull();  // identical
    expect(annualSaving(799, 12000)).toBeNull(); // annual costs MORE
  });

  it("returns null when a price is missing", () => {
    expect(annualSaving(0, 6999)).toBeNull();
    expect(annualSaving(799, 0)).toBeNull();
  });

  it("tracks a price change instead of going stale", () => {
    // the whole point of deriving it
    expect(annualSaving(999, 6999)!.percentOff).toBe(42);
  });
});

describe("perMonthFromAnnual", () => {
  it("shows annual as a comparable per-month figure", () => {
    expect(perMonthFromAnnual(6999)).toBe(583); // $5.83/mo
  });
});

describe("money", () => {
  it("drops needless cents but keeps real ones", () => {
    expect(money(6999)).toBe("$69.99");
    expect(money(799)).toBe("$7.99");
    expect(money(1000)).toBe("$10");
  });
});

describe("priceFor", () => {
  const prices: Price[] = [
    { id: "pro_799", planId: "pro", amountCents: 799, interval: "month", active: true },
    { id: "pro_annual_6999", planId: "pro", amountCents: 6999, interval: "year", active: true },
    { id: "pro_499", planId: "pro", amountCents: 499, interval: "month", active: false },
  ];

  it("picks the price matching plan AND interval", () => {
    expect(priceFor(prices, "pro", "month")?.id).toBe("pro_799");
    expect(priceFor(prices, "pro", "year")?.id).toBe("pro_annual_6999");
  });

  it("never returns a retired price", () => {
    // pro_499 is inactive — selecting it would charge a price we withdrew
    expect(priceFor(prices, "pro", "month")?.id).not.toBe("pro_499");
  });

  it("returns nothing for a plan with no price (coming soon)", () => {
    expect(priceFor(prices, "guardian", "month")).toBeUndefined();
  });
});
