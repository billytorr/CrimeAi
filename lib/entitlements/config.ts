// Tier configuration loader. Config lives in the DB (tier_plans /
// tier_prices / tier_limits) so prices and limits change WITHOUT a deploy
// (Rule 4). Loaded values are validated against the typed capability set
// on every (re)load and throw loudly on anything malformed.
// (serverDb is imported lazily inside loadTierConfig so the pure
//  validateConfig can be unit-tested without the DB/supabase chain.)
import { ALL_CAPABILITIES, type Capability } from "./capabilities";

export interface PriceConfig {
  id: string;
  planId: string;
  amountCents: number;
  currency: string;
  interval: string;
  label?: string;
  active: boolean;
}

export interface TierConfig {
  plans: string[];
  prices: PriceConfig[];
  limits: Record<string, Partial<Record<Capability, unknown>>>; // plan -> cap -> value
}

// Pure validation — no I/O, so it is fully unit-testable. Throws on the
// first problem with a message that names exactly what is wrong.
export function validateConfig(cfg: TierConfig): void {
  if (!cfg.plans.includes("free")) throw new Error("tier config: missing 'free' plan");
  if (!cfg.plans.includes("pro")) throw new Error("tier config: missing 'pro' plan");
  for (const plan of ["free", "pro"] as const) {
    const lim = cfg.limits[plan];
    if (!lim) throw new Error(`tier config: no limits for plan '${plan}'`);
    for (const cap of ALL_CAPABILITIES) {
      if (!(cap in lim)) throw new Error(`tier config: plan '${plan}' is missing capability '${cap}'`);
    }
  }
  if (!cfg.prices.some((p) => p.active)) throw new Error("tier config: no active price point");
  for (const p of cfg.prices) {
    if (typeof p.amountCents !== "number" || p.amountCents < 0) {
      throw new Error(`tier config: price '${p.id}' has invalid amount`);
    }
  }
}

let cache: { at: number; cfg: TierConfig } | null = null;
const TTL_MS = 60_000;

export function _resetConfigCache() { cache = null; } // test hook

export async function loadTierConfig(force = false): Promise<TierConfig> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);
  const [{ data: plans }, { data: prices }, { data: limits }] = await Promise.all([
    db.from("tier_plans").select("id, active"),
    db.from("tier_prices").select("id, plan_id, amount_cents, currency, interval, label, active"),
    db.from("tier_limits").select("plan_id, capability, value"),
  ]);
  const cfg: TierConfig = {
    plans: (plans || []).map((p: any) => p.id),
    prices: (prices || []).map((p: any) => ({
      id: p.id, planId: p.plan_id, amountCents: p.amount_cents, currency: p.currency,
      interval: p.interval, label: p.label || undefined, active: p.active,
    })),
    limits: {},
  };
  for (const l of (limits || []) as any[]) {
    (cfg.limits[l.plan_id] ||= {})[l.capability as Capability] = l.value;
  }
  validateConfig(cfg); // fail loudly on malformed config (Rule 4)
  cache = { at: Date.now(), cfg };
  return cfg;
}

export function planValue(cfg: TierConfig, plan: string, cap: Capability): unknown {
  return cfg.limits[plan]?.[cap];
}
