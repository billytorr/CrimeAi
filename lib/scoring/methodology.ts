// Published NSS methodology — GENERATED FROM THE LIVE CONFIG so the public
// document can never drift from the actual computation (spec Layer 1 /
// integrity rule 6: "Any journalist can audit the NSS methodology").
// Pure function of the config; served by /api/scoring/methodology.

import type { NssConfig } from "./config";

export function buildMethodology(cfg: NssConfig, censusRelease: string): string {
  const classes = Object.entries(cfg.severityClasses)
    .sort((a, b) => b[1].weight - a[1].weight)
    .map(([k, c]) => `| ${label(k)} | ${c.weight} | ${c.halflifeDays} days |`)
    .join("\n");
  const sources = Object.entries(cfg.sourceWeights)
    .sort((a, b) => b[1] - a[1])
    .map(([k, w]) => `| ${label(k)} | ${w.toFixed(2)} |`)
    .join("\n");

  return `# CrimeAI Neighborhood Safety Score — Methodology

Version: **${cfg.version}** · Generated live from the scoring configuration (this page can never lag the computation).

## What the score is

The Neighborhood Safety Score (NSS) is a 0–100 rating of **how much verified crime signal an area has experienced**, higher = safer. It is a factual claim about a place:

- **User engagement can never move it.** Likes, posts, follows and app activity have no path into this computation (enforced by an automated module-boundary test in our codebase).
- **Payment can never move it.** Subscription status has no path into this computation (same enforcement).
- Every published score can produce a full breakdown of its own inputs.

## How it is computed

For an area, every incident within ${cfg.horizonDays} days contributes:

    severity_weight × time_decay × distance_weight × source_credibility

summed, then normalized per capita, then ranked against the metro-wide distribution:

    NSS = 100 × (1 − percentile_rank(hazard, metro))

### Severity weights and per-class memory

| Incident class | Weight | Half-life |
|---|---|---|
${classes}

An incident's contribution halves every half-life period — a shooting months ago still matters; a noise complaint from last quarter does not.

### Distance

Gaussian kernel with σ = ${cfg.spatialSigmaMiles} miles: incidents just outside an area still count, weakly. Each area is scored over a ${cfg.areaRadiusMiles}-mile radius.

### Source credibility

| Source type | Weight |
|---|---|
${sources}

**A single unverified user report counts for ${cfg.sourceWeights.user_unverified ?? 0}.** User reports only gain weight through independent corroboration or an official-record match.

### Anti-manipulation caps (enforced in code)

- User-generated content can never exceed **${Math.round(cfg.caps.ugcShareMax * 100)}%** of an area's total signal — brigading a neighborhood's score is structurally impossible.
- A single user can never exceed **${Math.round(cfg.caps.singleUserShareMax * 100)}%** of the user-generated contribution — one motivated person cannot move a block.

### Population normalization

Hazard is divided by residential population (${censusRelease}, ZCTA-level approximation) so dense areas are not penalized for having more people. Where census coverage is unavailable, we fall back to area-based density **and lower the score's confidence**.

### Confidence and ranges

Confidence = feed coverage × source diversity × population reliability. **When confidence is below ${cfg.confidence.pointDisplayMin}, we display a range instead of a point value** (width up to ±${cfg.rangeWidth.slope}). A confident-looking number on thin data would be a lie; we do not publish one.

### Companion metrics

Trend, time-of-day pattern, city comparison, and dominant incident classes are shown alongside the score for context. **They are display only — never score inputs.**

## Known limitations

- Population figures are ZCTA (ZIP-area) approximations of the scoring circle.
- Metro percentile is currently ranked across the Miami neighborhood set; granularity grows with coverage.
- Where live official feeds are thin, curated/modeled data fills in and confidence is reduced accordingly.
`;
}

function label(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
