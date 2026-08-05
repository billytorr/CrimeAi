// The CUTOVER seam: replaces the displayed Safety Score with the new NSS.
//
// Billy signed off on the cutover after reviewing the divergence report, so
// `stats.safetyScore` now carries the NSS value everywhere the old number
// used to appear (profile card, Ask chip, AI context). The legacy formula is
// NOT removed — its value rides along as `legacySafetyScore` for comparison
// and debugging, and lib/data.ts is untouched.
//
// FAIL-SOFT: if the scoring engine errors (config unavailable, DB blip), the
// legacy score keeps serving. A scoring outage must never blank the card.

import type { AreaStats, Incident } from "@/lib/types";
import { computeNSSForPoint } from "./point-nss";

export async function withNSS(
  stats: AreaStats,
  opts: { lat: number; lon: number; radiusMiles: number; incidents: Incident[]; pool: "live" | "seed" | "synth" },
): Promise<AreaStats> {
  try {
    const nss = await computeNSSForPoint(opts);
    const point = nss.score ?? Math.round((nss.scoreLow + nss.scoreHigh) / 2);
    return {
      ...stats,
      safetyScore: point,                 // ← the NSS is now THE score
      legacySafetyScore: stats.safetyScore,
      nss: {
        display: nss.display,
        isRange: nss.isRange,
        low: nss.scoreLow,
        high: nss.scoreHigh,
        confidence: nss.confidence,
        version: nss.explanation.version,
      },
    };
  } catch (err) {
    console.error("[scoring] NSS overlay failed, serving legacy score:", (err as Error)?.message);
    return stats;
  }
}
