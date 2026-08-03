// A/B price-arm assignment. A user is assigned ONE active price point at
// signup and it's honored for the life of the subscription (Rule 4). The
// assignment is deterministic by user id so re-issuing a token never moves
// someone between arms.
import { createHash } from "node:crypto";
import type { PriceConfig } from "@/lib/entitlements/config";

export function assignPriceArm(userId: string, activeProPrices: PriceConfig[]): PriceConfig {
  const prices = activeProPrices.filter((p) => p.active && p.planId === "pro");
  if (prices.length === 0) throw new Error("no active pro price to assign");
  if (prices.length === 1) return prices[0];
  // stable hash → bucket
  const h = createHash("sha256").update(userId).digest();
  const idx = h[0] % prices.length;
  // sort for determinism regardless of DB row order
  const sorted = [...prices].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[idx];
}
