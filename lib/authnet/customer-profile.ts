// Customer Profile (CIM) from an Accept.js opaque nonce. We store a durable
// payment profile so the recurring ARB subscription and future card-update
// flows work — WITHOUT the raw card ever touching our servers (Rule 8).
// We keep only the masked last4 + brand for display.
import { anetPost } from "./client";
import { anetEnv } from "./env";

export interface StoredCard {
  customerProfileId: string;
  customerPaymentProfileId: string;
  last4: string;   // display only
  brand: string;   // display only
}

function cardBits(cc: any): { last4: string; brand: string } {
  let last4 = "", brand = "";
  if (cc?.cardNumber) last4 = String(cc.cardNumber).replace(/[^0-9]/g, "").slice(-4);
  if (cc?.cardType) brand = String(cc.cardType);
  return { last4, brand };
}

// Fetch a profile's stored (default / first) payment profile. Used when the
// customer already exists (returning subscriber) — an opaque nonce is
// single-use, so we can't re-tokenize; we reuse the card already on file.
async function firstStoredCard(customerProfileId: string): Promise<StoredCard> {
  const get = await anetPost("getCustomerProfileRequest", { customerProfileId });
  if (!get.ok) {
    throw new Error(`Authorize.Net getCustomerProfile error: ${get.code || ""} ${get.text || ""}`.trim());
  }
  const pps = get.raw?.profile?.paymentProfiles;
  const first = Array.isArray(pps) ? pps[pps.length - 1] : pps; // most recent if many
  const customerPaymentProfileId = first?.customerPaymentProfileId;
  if (!customerPaymentProfileId) {
    throw new Error("Existing customer profile has no payment profile on file");
  }
  const { last4, brand } = cardBits(first?.payment?.creditCard);
  return { customerProfileId, customerPaymentProfileId: String(customerPaymentProfileId), last4, brand };
}

// Delete a stored profile (sandbox cleanup / GDPR-style removal).
export async function deleteCustomerProfile(customerProfileId: string): Promise<boolean> {
  const res = await anetPost("deleteCustomerProfileRequest", { customerProfileId });
  return res.ok;
}

// opaque = { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue }
export async function createCustomerProfileFromOpaque(
  userId: string,
  email: string,
  opaque: { dataDescriptor: string; dataValue: string },
  name?: string,
): Promise<StoredCard> {
  // ARB charges the stored profile and requires a billing name ON the payment
  // profile (it rejects billTo in the subscription request itself). Store it
  // here at creation time.
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const billTo = { firstName: (parts[0] || "CrimeAI").slice(0, 50), lastName: (parts.slice(1).join(" ") || "Member").slice(0, 50) };

  // sandbox can't run a real liveMode validation transaction; use testMode
  // there and liveMode in production (a $0 auth+void that confirms the card).
  const validationMode = anetEnv() === "production" ? "liveMode" : "testMode";
  const create = await anetPost("createCustomerProfileRequest", {
    profile: {
      merchantCustomerId: userId.slice(0, 20),
      email,
      paymentProfiles: [{ billTo, payment: { opaqueData: opaque } }],
    },
    validationMode,
  });

  if (!create.ok) {
    // Returning subscriber: a profile for this merchantCustomerId already
    // exists. Reuse it (the card is already stored) instead of failing.
    const msgs = create.raw?.messages?.message;
    const arr = Array.isArray(msgs) ? msgs : msgs ? [msgs] : [];
    const dup = arr.find((m: any) => m.code === "E00039");
    if (dup) {
      const existingId = (create.raw?.customerProfileId) || String(dup.text || "").match(/ID\s+(\d+)/)?.[1];
      if (existingId) return firstStoredCard(String(existingId));
    }
    const detail = arr.map((m: any) => `${m.code}:${m.text}`).join(" | ") || `${create.code || ""} ${create.text || ""}`;
    throw new Error(`Authorize.Net profile error [${validationMode}]: ${detail}`.trim());
  }

  const customerProfileId = create.raw.customerProfileId;
  if (!customerProfileId) throw new Error("Authorize.Net did not return a customer profile id");

  // Resolve the payment-profile id + masked card by reading the profile back.
  // More robust than parsing customerPaymentProfileIdList and identical to the
  // returning-subscriber path, so both behave the same downstream.
  return firstStoredCard(String(customerProfileId));
}
