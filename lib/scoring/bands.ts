// Safety Score display bands.
//
// The score is a METRO PERCENTILE (100 = safer than everywhere else in the
// metro, 50 = the median area), so the bands are quartiles of that
// distribution — not absolute crime thresholds. The old bands (75/55/40)
// were tuned for the legacy density formula and mislabel a percentile score.
//
// IMPORTANT PROPERTY (by construction): roughly a quarter of areas will
// always sit in the lowest band, because the score ranks areas against each
// other. The label describes RELATIVE position, not absolute danger.
//
// Labels are the ones already shipped in the app — thresholds changed, copy
// unchanged. Both live here so there is one source of truth (the card and
// the Ask chip previously duplicated them).

export interface ScoreBand { min: number; label: string; color: string }

export const SCORE_BANDS: ScoreBand[] = [
  { min: 75, label: "Calm", color: "#1b7f3a" },        // top quartile of the metro
  { min: 50, label: "Moderate", color: "#86b300" },    // above the median
  { min: 25, label: "Elevated", color: "#d98a00" },    // below the median
  { min: 0, label: "High activity", color: "#c0392b" }, // bottom quartile
];

export function bandFor(score: number): ScoreBand {
  for (const b of SCORE_BANDS) if (score >= b.min) return b;
  return SCORE_BANDS[SCORE_BANDS.length - 1];
}

// Plain-language explanation of what the number means, derived from the
// score itself so it can never contradict the band.
export function percentileSentence(score: number): string {
  return `Safer than about ${Math.round(score)}% of the metro area.`;
}
