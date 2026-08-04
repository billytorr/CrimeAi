import { describe, it, expect } from "vitest";
import { clampDays, trimStatsForDepth } from "./request";
import type { AreaStats } from "@/lib/types";

describe("clampDays — map history window", () => {
  it("no limit (kill switch off / fail-open) → requested passes through", () => {
    expect(clampDays(90, null)).toBe(90);
  });
  it("clamps a free user's 90-day request to 7", () => {
    expect(clampDays(90, 7)).toBe(7);
  });
  it("a request under the limit is untouched", () => {
    expect(clampDays(3, 7)).toBe(3);
  });
  it("garbage requests default sanely", () => {
    expect(clampDays(NaN, 7)).toBe(7);
    expect(clampDays(-5, null)).toBe(30);
  });
  it("garbage limit values fail open", () => {
    expect(clampDays(90, "banana")).toBe(90);
    expect(clampDays(90, 0)).toBe(90);
  });
});

const STATS: AreaStats = {
  total: 42, byCategory: { theft: 20 },
  byType: [{ type: "a", count: 9 }, { type: "b", count: 8 }, { type: "c", count: 7 }, { type: "d", count: 6 }],
  bySource: [{ source: "mpd", label: "Miami PD", count: 40 }],
  hourHistogram: new Array(24).fill(1), nightSharePct: 33,
  last7: 5, prev7: 4, trendPct: 25, safetyScore: 71, cityComparisonPct: -12, topCategory: "theft",
} as AreaStats;

describe("trimStatsForDepth — Safety Score depth", () => {
  it("full depth (Protector) keeps everything", () => {
    const r = trimStatsForDepth(STATS, "full");
    expect(r.statsDepth).toBe("full");
    expect(r.hourHistogram.length).toBe(24);
    expect(r.byType.length).toBe(4);
    expect(r.cityComparisonPct).toBe(-12);
  });
  it("null depth (enforcement off) keeps everything", () => {
    expect(trimStatsForDepth(STATS, null).statsDepth).toBe("full");
  });
  it("'current' strips deep analytics but NEVER the score itself", () => {
    const r = trimStatsForDepth(STATS, "current");
    expect(r.statsDepth).toBe("current");
    expect(r.safetyScore).toBe(71);   // the score always survives
    expect(r.total).toBe(42);
    expect(r.byType.length).toBe(3);  // top 3 only
    expect(r.hourHistogram).toEqual([]);
    expect(r.bySource).toEqual([]);
    expect(r.cityComparisonPct).toBe(0);
  });
});
