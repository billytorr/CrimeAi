// Platform link-out fee hook (Rule 6). Returns ZERO today, but has the
// shape to return a real percentage later — so introducing storefront
// link-out fees within the next year is a config change, not an
// architecture change. Wire rateBps to config when fees become real.
export interface FeeContext {
  amountCents: number;
  priceId: string;
  storefront?: string; // e.g. "ios" | "android" | "web"
}

export interface FeeResult {
  feeCents: number;
  netCents: number;
  rateBps: number; // basis points (100 bps = 1%)
}

export function computeFee(ctx: FeeContext): FeeResult {
  const rateBps = 0; // ← the only number to change when fees exist
  const feeCents = Math.round((ctx.amountCents * rateBps) / 10_000);
  return { feeCents, netCents: ctx.amountCents - feeCents, rateBps };
}
