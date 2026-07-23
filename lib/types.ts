// Normalized incident schema — single converged shape for every source
// (roadmap §5.8). The brain never cares about provenance at query time,
// but provenance + confidence are preserved for trust ranking and audit.
export type Category = "violent" | "property" | "nuisance" | "hazard" | "unverified";

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
  safetyScore: number; // 0-100 (higher = safer)
  cityComparisonPct: number; // +/- vs city avg rate
  topCategory: string;
}
