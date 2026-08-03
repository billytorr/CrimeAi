// Customer Profile (CIM) from an Accept.js opaque nonce. We store a durable
// payment profile so the recurring ARB subscription and future card-update
// flows work — WITHOUT the raw card ever touching our servers (Rule 8).
// We keep only the masked last4 + brand for display.
import { anetPost } from "./client";

export interface StoredCard {
  customerProfileId: string;
  customerPaymentProfileId: string;
  last4: string;   // display only
  brand: string;   // display only
}

// opaque = { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue }
export async function createCustomerProfileFromOpaque(
  userId: string,
  email: string,
  opaque: { dataDescriptor: string; dataValue: string },
): Promise<StoredCard> {
  const create = await anetPost("createCustomerProfileRequest", {
    profile: {
      merchantCustomerId: userId.slice(0, 20),
      email,
      paymentProfiles: [{ payment: { opaqueData: opaque } }],
    },
    validationMode: "liveMode",
  });
  if (!create.ok) {
    throw new Error(`Authorize.Net profile error: ${create.code || ""} ${create.text || ""}`.trim());
  }
  const customerProfileId = create.raw.customerProfileId;
  const customerPaymentProfileId = create.raw.customerPaymentProfileIdList?.[0];
  if (!customerProfileId || !customerPaymentProfileId) {
    throw new Error("Authorize.Net did not return profile ids");
  }

  // read back the masked card for display (never the full PAN)
  let last4 = "", brand = "";
  try {
    const get = await anetPost("getCustomerPaymentProfileRequest", {
      customerProfileId,
      customerPaymentProfileId,
    });
    const cc = get.raw?.paymentProfile?.payment?.creditCard;
    if (cc?.cardNumber) last4 = String(cc.cardNumber).replace(/[^0-9]/g, "").slice(-4);
    if (cc?.cardType) brand = String(cc.cardType);
  } catch { /* display only — non-fatal */ }

  return { customerProfileId, customerPaymentProfileId, last4, brand };
}
