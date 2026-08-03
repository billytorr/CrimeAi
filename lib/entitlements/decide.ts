// Pure entitlement decision — NO I/O, so every capability, tier, and
// boundary is unit-testable without a database. The service layer feeds
// it the already-loaded config value and current usage.
import { CAP_META, type Capability } from "./capabilities";

export interface DecideResult {
  allowed: boolean;
  value: unknown;       // the raw config value for the effective plan
  limit?: number;       // numeric cap, when applicable
  used?: number;        // current usage (metered)
  remaining?: number;   // limit - used (metered); Infinity if unlimited
  reason?: string;
}

// value: the config value for the user's EFFECTIVE plan (free vs pro).
// used:  current usage count this period (metered capabilities only).
export function decide(cap: Capability, value: unknown, used = 0): DecideResult {
  const meta = CAP_META[cap];

  if (meta.kind === "boolean") {
    return { allowed: value === true, value };
  }

  if (meta.kind === "metered") {
    const limit = typeof value === "number" ? value : -1;
    const unlimited = limit < 0;
    const remaining = unlimited ? Infinity : Math.max(0, limit - used);
    return {
      allowed: unlimited || used < limit,
      value, limit, used, remaining,
      reason: unlimited || used < limit ? undefined : "limit_reached",
    };
  }

  // "limit" kind: caller enforces the cap (e.g. count ≤ value). We expose
  // the value; allowed is true because the cap itself isn't a yes/no gate.
  const limit = typeof value === "number" ? value : undefined;
  return { allowed: true, value, limit };
}
