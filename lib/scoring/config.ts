// Scoring configuration — every constant from crimeai-scoring-algorithm-spec.md.
// Rule 9: constants live in the DB (scoring_config), changeable without a
// deploy. DEFAULTS below mirror the SQL seed exactly and serve as the
// validated fallback before the table is seeded (and for pure unit tests).
// Rule: validation FAILS LOUDLY on malformed config — a bad weight must never
// silently compute a wrong public safety number.
//
// MODULE BOUNDARY (Rule 2): scoring must never import entitlement,
// subscription, or gamification LOGIC. The shared service-role DB client
// (lib/payments/serverdb.ts — a neutral utility, not payment logic) is the
// single allowed exception, used only to read scoring_config. CI-enforced:
// nss.ts/geo.ts are fully pure; this loader may touch only serverdb.

export interface SeverityClass { weight: number; halflifeDays: number }

export interface NssConfig {
  severityClasses: Record<string, SeverityClass>;
  categoryClassMap: Record<string, string>; // existing incident category -> class
  spatialSigmaMiles: number;
  sourceWeights: Record<string, number>;
  sourceKindMap: Record<string, string>;    // incident.source -> source weight key
  caps: { ugcShareMax: number; singleUserShareMax: number };
  confidence: { pointDisplayMin: number; populationSaturation: number; sourceDiversityTarget: number };
  horizonDays: number;                       // incident lookback fed to the decay
  coverageFactors: Record<string, number>;   // pool kind ("live"|"seed"|"synth") -> coverage 0-1
  areaRadiusMiles: number;                   // scoring circle radius per area
  rangeWidth: { slope: number; min: number };// range half-width = max(min, (1−C)×slope)
  version: string;
}

export interface ScoringConfig { nss: NssConfig }

export const DEFAULTS: ScoringConfig = {
  nss: {
    severityClasses: {
      violent_armed:        { weight: 100, halflifeDays: 120 },
      violent_unarmed:      { weight: 60,  halflifeDays: 90 },
      sexual_offense:       { weight: 90,  halflifeDays: 180 },
      burglary_residential: { weight: 30,  halflifeDays: 45 },
      burglary_commercial:  { weight: 18,  halflifeDays: 45 },
      motor_vehicle_theft:  { weight: 20,  halflifeDays: 30 },
      theft_from_vehicle:   { weight: 12,  halflifeDays: 30 },
      larceny_other:        { weight: 8,   halflifeDays: 30 },
      vandalism:            { weight: 5,   halflifeDays: 21 },
      disorder:             { weight: 3,   halflifeDays: 14 },
      quality_of_life:      { weight: 1,   halflifeDays: 7 },
    },
    categoryClassMap: {
      violent: "violent_armed", sexual: "sexual_offense", domestic: "violent_unarmed",
      burglary: "burglary_residential", vehicle: "theft_from_vehicle",
      identity: "larceny_other", cyber: "quality_of_life", other: "disorder",
      unverified: "quality_of_life",
    },
    spatialSigmaMiles: 0.5,
    sourceWeights: {
      official: 1.0, verified_aggregator: 0.85, scanner: 0.6,
      user_official_match: 0.85, user_corroborated: 0.45, user_unverified: 0.0,
    },
    sourceKindMap: {
      open_data: "official", miamidade_open: "official", arcgis: "official",
      socrata: "official", geojson: "official", nws: "official",
      spotcrime: "verified_aggregator", citizen: "verified_aggregator",
      liveuamap: "verified_aggregator", scanner: "scanner",
      pscc_model: "verified_aggregator",
      nextdoor: "user_unverified", community: "user_unverified",
    },
    caps: { ugcShareMax: 0.3, singleUserShareMax: 0.05 },
    confidence: { pointDisplayMin: 0.6, populationSaturation: 5000, sourceDiversityTarget: 3 },
    horizonDays: 180,
    coverageFactors: { live: 1.0, seed: 0.9, synth: 0.4 },
    areaRadiusMiles: 1,
    rangeWidth: { slope: 25, min: 3 },
    version: "nss-v1",
  },
};

export function validateScoringConfig(cfg: ScoringConfig): void {
  const n = cfg?.nss;
  if (!n) throw new Error("scoring config: missing nss block");
  const classes = Object.entries(n.severityClasses || {});
  if (!classes.length) throw new Error("scoring config: no severity classes");
  for (const [k, c] of classes) {
    if (typeof c.weight !== "number" || c.weight < 0) throw new Error(`scoring config: class '${k}' has invalid weight`);
    if (typeof c.halflifeDays !== "number" || c.halflifeDays <= 0) throw new Error(`scoring config: class '${k}' has invalid halflife`);
  }
  for (const [cat, cls] of Object.entries(n.categoryClassMap || {})) {
    if (!n.severityClasses[cls]) throw new Error(`scoring config: category '${cat}' maps to unknown class '${cls}'`);
  }
  if (typeof n.spatialSigmaMiles !== "number" || n.spatialSigmaMiles <= 0) throw new Error("scoring config: invalid spatialSigmaMiles");
  for (const [k, w] of Object.entries(n.sourceWeights || {})) {
    if (typeof w !== "number" || w < 0 || w > 1) throw new Error(`scoring config: source weight '${k}' outside [0,1]`);
  }
  for (const [src, key] of Object.entries(n.sourceKindMap || {})) {
    if (n.sourceWeights[key] === undefined) throw new Error(`scoring config: source '${src}' maps to unknown weight key '${key}'`);
  }
  const caps = n.caps;
  if (!caps || caps.ugcShareMax <= 0 || caps.ugcShareMax > 1) throw new Error("scoring config: invalid ugcShareMax");
  if (caps.singleUserShareMax <= 0 || caps.singleUserShareMax > 1) throw new Error("scoring config: invalid singleUserShareMax");
  if (!n.confidence || n.confidence.pointDisplayMin <= 0 || n.confidence.pointDisplayMin > 1) throw new Error("scoring config: invalid confidence.pointDisplayMin");
  if (typeof n.horizonDays !== "number" || n.horizonDays <= 0) throw new Error("scoring config: invalid horizonDays");
  for (const [k, v] of Object.entries(n.coverageFactors || {})) {
    if (typeof v !== "number" || v < 0 || v > 1) throw new Error(`scoring config: coverage factor '${k}' outside [0,1]`);
  }
  if (!Object.keys(n.coverageFactors || {}).length) throw new Error("scoring config: missing coverageFactors");
  if (typeof n.areaRadiusMiles !== "number" || n.areaRadiusMiles <= 0) throw new Error("scoring config: invalid areaRadiusMiles");
  if (!n.rangeWidth || typeof n.rangeWidth.slope !== "number" || n.rangeWidth.slope < 0 || typeof n.rangeWidth.min !== "number" || n.rangeWidth.min < 0) {
    throw new Error("scoring config: invalid rangeWidth");
  }
  if (!n.version || typeof n.version !== "string") throw new Error("scoring config: missing version");
}
validateScoringConfig(DEFAULTS); // boot-time self check: defaults must always be valid

let cache: { at: number; cfg: ScoringConfig } | null = null;
const TTL_MS = 60_000;
export function _resetScoringConfigCache() { cache = null; } // test hook

// DB-backed loader. Missing rows fall back to DEFAULTS (pre-seed boot);
// malformed rows THROW — never compute a public score from bad config.
export async function loadScoringConfig(force = false): Promise<ScoringConfig> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  const { serverDb } = await import("@/lib/payments/serverdb");
  // scoring_config is world-readable (methodology transparency), so the
  // non-privileged client is enough — and lets local tooling (divergence
  // report) run with just the anon key.
  const db = serverDb(false);
  const { data, error } = await db.from("scoring_config").select("key, value");
  if (error) throw new Error(`scoring config load failed: ${error.message}`);
  const kv = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));

  const cfg: ScoringConfig = {
    nss: {
      severityClasses: mapClasses(kv["nss.severity_classes"]) ?? DEFAULTS.nss.severityClasses,
      categoryClassMap: kv["nss.category_class_map"] ?? DEFAULTS.nss.categoryClassMap,
      spatialSigmaMiles: kv["nss.spatial_sigma_miles"] ?? DEFAULTS.nss.spatialSigmaMiles,
      sourceWeights: kv["nss.source_weights"] ?? DEFAULTS.nss.sourceWeights,
      sourceKindMap: kv["nss.source_kind_map"] ?? DEFAULTS.nss.sourceKindMap,
      caps: kv["nss.caps"]
        ? { ugcShareMax: kv["nss.caps"].ugc_share_max, singleUserShareMax: kv["nss.caps"].single_user_share_max }
        : DEFAULTS.nss.caps,
      confidence: kv["nss.confidence"]
        ? { pointDisplayMin: kv["nss.confidence"].point_display_min, populationSaturation: kv["nss.confidence"].population_saturation, sourceDiversityTarget: kv["nss.confidence"].source_diversity_target }
        : DEFAULTS.nss.confidence,
      horizonDays: kv["nss.horizon_days"] ?? DEFAULTS.nss.horizonDays,
      coverageFactors: kv["nss.coverage_factors"] ?? DEFAULTS.nss.coverageFactors,
      areaRadiusMiles: kv["nss.area_radius_miles"] ?? DEFAULTS.nss.areaRadiusMiles,
      rangeWidth: kv["nss.range_width"] ?? DEFAULTS.nss.rangeWidth,
      version: kv["nss.version"] ?? DEFAULTS.nss.version,
    },
  };
  validateScoringConfig(cfg); // throws loudly on malformed DB values
  cache = { at: Date.now(), cfg };
  return cfg;
}

function mapClasses(raw: any): Record<string, SeverityClass> | null {
  if (!raw) return null;
  const out: Record<string, SeverityClass> = {};
  for (const [k, v] of Object.entries<any>(raw)) out[k] = { weight: v.weight, halflifeDays: v.halflife_days ?? v.halflifeDays };
  return out;
}
