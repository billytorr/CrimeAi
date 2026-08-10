// Typed capability enumeration — the ONLY place capability names are
// defined. No capability strings anywhere else in the codebase (Rule 4).
export const CAPABILITIES = {
  MAP_HISTORY_DAYS: "map_history_days",
  SAVED_LOCATIONS: "saved_locations",
  ALERT_RADIUS: "alert_radius",
  ADDRESS_SEARCH: "address_search",
  AI_ANALYTICAL: "ai_analytical",
  AI_VISION: "ai_vision",     // image/file analysis (Protector)
  SMS_IMMEDIATE: "sms_immediate",
  CHANNELS: "channels",
  TRUSTED_CIRCLE: "trusted_circle",
  SAFETY_SCORE_DEPTH: "safety_score_depth",
  PROTECTOR_BADGE: "protector_badge",
  PRIORITY_VISIBILITY: "priority_visibility",
  EARLY_ACCESS: "early_access",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export type CapKind =
  | "boolean" // on/off perk
  | "limit"   // a numeric/enum cap the caller enforces (count ≤ value)
  | "metered"; // consumable per billing period (atomic consume)

export interface CapMeta {
  kind: CapKind;
  // costPath = each unit costs real money (SMS) or expensive inference (AI).
  // On infra error these FAIL CLOSED to free-tier behavior (Rule 3 exception).
  costPath: boolean;
}

export const CAP_META: Record<Capability, CapMeta> = {
  map_history_days: { kind: "limit", costPath: false },
  saved_locations: { kind: "limit", costPath: false },
  alert_radius: { kind: "limit", costPath: false },
  address_search: { kind: "metered", costPath: false },
  ai_analytical: { kind: "metered", costPath: true }, // expensive inference
  ai_vision: { kind: "metered", costPath: true },     // vision inference (Protector)
  sms_immediate: { kind: "metered", costPath: true }, // per-SMS money
  channels: { kind: "limit", costPath: false },
  trusted_circle: { kind: "limit", costPath: false },
  safety_score_depth: { kind: "limit", costPath: false },
  protector_badge: { kind: "boolean", costPath: false },
  priority_visibility: { kind: "boolean", costPath: false },
  early_access: { kind: "boolean", costPath: false },
};

export const ALL_CAPABILITIES = Object.values(CAPABILITIES) as Capability[];
export const METERED_CAPABILITIES = ALL_CAPABILITIES.filter((c) => CAP_META[c].kind === "metered");
