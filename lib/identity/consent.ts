// BIPA consent text — the exact words a user agrees to before any
// biometric capture.
//
// ⚠️ Stored VERBATIM with every consent record. Illinois requires proof of
// what a person agreed to, not just that they agreed, so this text and the
// record must always match.
//
// ⚠️ CHANGING THE WORDS MEANS BUMPING THE VERSION. Consent to v1 is not
// consent to v2 — a user who agreed to different terms has not agreed to
// these. Bumping re-prompts anyone verified under an older version.
//
// ⚠️ NOT REVIEWED BY COUNSEL. See DATA-GOVERNANCE.md — a BIPA-experienced
// attorney must approve this before capture ships.

export const CONSENT_VERSION = 1;

/** Replaced with the real vendor name once one is chosen. */
export const IDV_VENDOR_NAME = process.env.NEXT_PUBLIC_IDV_VENDOR_NAME || "our verification partner";

export const CONSENT_TEXT = [
  "To report crime on CrimeAI, we need to confirm you are a real person.",
  "",
  `We will ask for a photo of your face and a photo of your government ID. ${IDV_VENDOR_NAME} uses these to create a face template and check that the ID belongs to you.`,
  "",
  "We delete your selfie, your ID image and the face template within 24 hours of verification, and our partner deletes their copies on the same schedule. We keep only the result: that you were verified, when, how, whether you are over 18, and the last four digits and issuing state of your ID.",
  "",
  "We do not sell this data. We never use it to train AI models. We never use your face to identify you in any photo other than your own ID.",
  "",
  "You do not have to do this. You can read CrimeAI, post, comment and follow without verifying — only crime reporting requires it.",
].join("\n");

/** What the user is agreeing to, in one line, for the checkbox itself. */
export const CONSENT_CHECKBOX =
  "I have read the above and consent to CrimeAI and its verification partner collecting and storing my biometric identifiers as described.";
