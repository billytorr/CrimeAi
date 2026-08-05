import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AreaStats } from "@/lib/types";

const point = vi.fn();
vi.mock("@/lib/scoring/point-nss", () => ({ computeNSSForPoint: (...a: any[]) => point(...a) }));
import { withNSS } from "@/lib/scoring/overlay";

const STATS = { total: 12, safetyScore: 63, byCategory: {}, byType: [], bySource: [], hourHistogram: [], nightSharePct: 0, last7: 1, prev7: 1, trendPct: 0, cityComparisonPct: 0, topCategory: "x" } as unknown as AreaStats;
const OPTS = { lat: 25.76, lon: -80.19, radiusMiles: 1, incidents: [], pool: "seed" as const };

beforeEach(() => point.mockClear());

describe("NSS cutover overlay — the new score is THE score", () => {
  it("replaces safetyScore with the NSS value and preserves the legacy number", async () => {
    point.mockResolvedValue({ score: 41, scoreLow: 38, scoreHigh: 44, hazard: 1, confidence: 0.9, display: "41", isRange: false, explanation: { version: "nss-v1" } });
    const out = await withNSS(STATS, OPTS);
    expect(out.safetyScore).toBe(41);          // ← what the profile card shows
    expect(out.legacySafetyScore).toBe(63);    // ← old formula kept, not removed
    expect(out.nss).toMatchObject({ display: "41", isRange: false, version: "nss-v1" });
  });

  it("low confidence → the card gets a RANGE to display, ring uses the midpoint", async () => {
    point.mockResolvedValue({ score: null, scoreLow: 30, scoreHigh: 60, hazard: 1, confidence: 0.4, display: "30–60", isRange: true, explanation: { version: "nss-v1" } });
    const out = await withNSS(STATS, OPTS);
    expect(out.nss?.isRange).toBe(true);
    expect(out.nss?.display).toBe("30–60");
    expect(out.safetyScore).toBe(45);          // midpoint drives the ring
  });

  it("FAIL-SOFT: a scoring failure keeps the legacy score serving (card never blanks)", async () => {
    // Malformed/absent scoring result (config unavailable, bad deploy): the
    // failure surfaces INSIDE withNSS's try block, which must swallow it and
    // keep serving the legacy score.
    point.mockResolvedValue(undefined as never);
    const out = await withNSS(STATS, OPTS);
    expect(out.safetyScore).toBe(63);
    expect(out.nss).toBeUndefined();
    expect(out).toEqual(STATS);
  });

  it("does not mutate the input stats object", async () => {
    point.mockResolvedValue({ score: 10, scoreLow: 8, scoreHigh: 12, hazard: 1, confidence: 0.9, display: "10", isRange: false, explanation: { version: "nss-v1" } });
    await withNSS(STATS, OPTS);
    expect(STATS.safetyScore).toBe(63);
  });
});
