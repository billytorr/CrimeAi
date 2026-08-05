// Normalized incident schema — single converged shape for every source
// (roadmap §5.8). The brain never cares about provenance at query time,
// but provenance + confidence are preserved for trust ranking and audit.
export type Category =
  | "domestic"   // Domestic Violence
  | "sexual"     // Sexual Assault & Harassment
  | "violent"    // Violent Crime (murder, assault, robbery, shots fired)
  | "burglary"   // Home Burglary
  | "vehicle"    // Vehicle Theft & Break-ins
  | "identity"   // Identity Theft & Fraud
  | "cyber"      // Cyber Crime & Scams
  | "other"      // Everything else that happens in a neighborhood
  | "unverified";

export interface Incident {
  incident_id: string;
  source: string;
  source_label: string;
  verified: boolean;
  category: Category;
  type: string;
  neighborhood: string;
  block: string;
  lat: number;
  lon: number;
  occurred_at: string; // ISO
  reported_at: string; // ISO
  severity: number; // 1-5
  confidence: number; // 0-1
  corroborating_sources: { source: string; label: string }[];
}

export interface ResolvedLocation {
  query: string;
  lat: number;
  lon: number;
  neighborhood: string;
  city: string;
  state: string;
  source: "gazetteer" | "nominatim" | "mapbox";
}

export interface AreaStats {
  total: number;
  byCategory: Record<string, number>;
  byType: { type: string; count: number }[];
  bySource: { source: string; label: string; count: number }[];
  hourHistogram: number[]; // 24 buckets
  nightSharePct: number; // % between 9pm-4am
  last7: number;
  prev7: number;
  trendPct: number; // change last7 vs prev7
  safetyScore: number; // 0-100 (higher = safer) — the LIVE score (NSS once computed)
  // NSS detail, present when the scoring engine produced the value above.
  // `display` is what the UI prints (a number, or a range when confidence is
  // low). `legacySafetyScore` keeps the pre-NSS formula's value for
  // comparison — nothing was removed, it simply no longer drives the UI.
  nss?: {
    display: string;
    isRange: boolean;
    low: number;
    high: number;
    confidence: number;
    version: string;
  };
  legacySafetyScore?: number;
  cityComparisonPct: number; // +/- vs city avg rate
  topCategory: string;
}
