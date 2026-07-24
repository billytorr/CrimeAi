// ── Crime category taxonomy — SINGLE SOURCE OF TRUTH ────────────────
// Every surface (map filters, report composer, alert prefs, feed badges,
// breakdowns) renders from this list. The ids are what gets persisted in
// posts.category and the incident seed; legacy values from the original
// 4-category system (property/nuisance/hazard + old report ids) are
// normalized on read via normalizeCat().
export interface CategoryDef {
  id: string;
  label: string;   // full name (composer, settings)
  short: string;   // compact chip label (map filters, badges)
  color: string;
  severity: number; // default severity when a community report maps to an incident (1-5)
}

export const CATEGORIES: CategoryDef[] = [
  { id: "domestic", label: "Domestic Violence", short: "Domestic", color: "#e11d48", severity: 5 },
  { id: "sexual", label: "Sexual Assault & Harassment", short: "Sexual", color: "#a855f7", severity: 5 },
  { id: "violent", label: "Violent Crime", short: "Violent", color: "#c0392b", severity: 4 },
  { id: "burglary", label: "Home Burglary", short: "Burglary", color: "#d98a00", severity: 4 },
  { id: "vehicle", label: "Vehicle Theft & Break-ins", short: "Vehicle", color: "#f97316", severity: 3 },
  { id: "identity", label: "Identity Theft & Fraud", short: "Identity", color: "#14b8a6", severity: 3 },
  { id: "cyber", label: "Cyber Crime & Scams", short: "Cyber", color: "#3b82f6", severity: 2 },
  { id: "other", label: "Other / Suspicious Activity", short: "Other", color: "#64748b", severity: 1 },
];

export const CAT_COLOR: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]));
export const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.short]));
export const CAT_FULL_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

// legacy → new (old seed data, old posts in the DB, old report-composer ids)
const LEGACY: Record<string, string> = {
  property: "burglary",
  nuisance: "other",
  hazard: "other",
  theft: "burglary",
  harassment: "sexual",
  unknown: "other",
  unverified: "other",
};

export function normalizeCat(cat?: string | null): string {
  if (!cat) return "other";
  if (CAT_COLOR[cat]) return cat;
  return LEGACY[cat] || "other";
}

export const catColor = (cat?: string | null) => CAT_COLOR[normalizeCat(cat)];
export const catShort = (cat?: string | null) => CAT_LABEL[normalizeCat(cat)];
export const catSeverity = (cat?: string | null) => CATEGORIES.find((c) => c.id === normalizeCat(cat))?.severity ?? 1;
