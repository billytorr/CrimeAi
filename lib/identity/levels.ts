// Identity trust levels L0–L4 — pure computation per the scoring spec Layer 5.
// Level NEVER gates posting, reporting, or safety features (Rules 1/3): it is
// consumed ONLY as a trust weight by Guardian scoring (Phase 7).
//
//   L0  account exists
//   L1  email + non-VOIP phone verified
//   L2  L1 + device attestation + geo consistency
//   L3  L2 + government ID verified (vendor)
//   L4  L3 + selfie liveness matched to ID (vendor)

export interface IdentityFactors {
  emailVerified: boolean;
  phoneVerified: boolean;    // dormant until Twilio Verify is wired
  deviceAttested: boolean;   // dormant until native attestation is wired
  geoConsistent: boolean;
  vendorPassed?: boolean | null;
  vendorLevel?: 3 | 4 | null;
  vendorExpiresAt?: string | null; // L3/L4 expire annually
}

export function computeLevel(f: IdentityFactors, now: number = Date.now()): 0 | 1 | 2 | 3 | 4 {
  const l1 = f.emailVerified && f.phoneVerified;
  if (!l1) return 0;
  const l2 = f.deviceAttested && f.geoConsistent;
  if (!l2) return 1;
  const vendorValid =
    f.vendorPassed === true &&
    (f.vendorLevel === 3 || f.vendorLevel === 4) &&
    (!f.vendorExpiresAt || +new Date(f.vendorExpiresAt) > now);
  if (!vendorValid) return 2;
  return f.vendorLevel === 4 ? 4 : 3;
}

// Expiry helper: L3/L4 verifications expire annually (spec rule 8).
export function vendorExpiry(verifiedAt: number): string {
  return new Date(verifiedAt + 365 * 86_400_000).toISOString();
}
