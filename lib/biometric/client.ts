// Biometric app lock — Face ID / Touch ID (iOS) and BiometricPrompt (Android).
//
// ⚠️ THIS DOES NOT COLLECT BIOMETRIC DATA, and must never be changed so that
// it does. Both platforms keep the fingerprint/face template inside the
// Secure Enclave / TEE and hand the app back a single boolean. Nothing
// biometric is read, transmitted or stored by us, which is what keeps this
// consistent with the project rule that no biometric data is ever stored.
//
// ⚠️ RULE 1 — this must never gate a safety path. The lock screen exposes SOS
// without unlocking (see components/AppLock.tsx). A failed Face ID in an
// emergency — wet hands, a mask, the dark, panic — must never be what stands
// between someone and calling for help.
//
// DORMANT-SAFE: on web, or before the plugin is installed, every function
// reports "unavailable" instead of throwing.

export type BiometryKind = "faceId" | "touchId" | "fingerprint" | "face" | "iris" | "none";

export interface BiometryStatus {
  available: boolean;
  /** what the device actually offers, for labelling the UI honestly */
  kind: BiometryKind;
  reason?: string;
}

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.protocol;
  return p === "capacitor:" || p === "ionic:";
}

// The plugin's numeric BiometryType -> our string. Values are stable in
// @aparajita/capacitor-biometric-auth: 0 none, 1 touchId, 2 faceId,
// 3 fingerprint, 4 face, 5 iris.
const KINDS: Record<number, BiometryKind> = { 0: "none", 1: "touchId", 2: "faceId", 3: "fingerprint", 4: "face", 5: "iris" };

async function plugin(): Promise<any | null> {
  if (!isNative()) return null;
  const mod: any = await import(/* webpackIgnore: true */ "@aparajita/capacitor-biometric-auth").catch(() => null);
  return mod?.BiometricAuth ?? null;
}

/** What this device supports. Never throws. */
export async function biometryStatus(): Promise<BiometryStatus> {
  if (!isNative()) return { available: false, kind: "none", reason: "not a native build" };
  try {
    const BiometricAuth = await plugin();
    if (!BiometricAuth) return { available: false, kind: "none", reason: "biometric plugin not installed" };
    const info = await BiometricAuth.checkBiometry();
    return {
      available: !!info?.isAvailable,
      kind: KINDS[info?.biometryType as number] ?? "none",
      reason: info?.isAvailable ? undefined : info?.reason || "no biometry enrolled",
    };
  } catch (e) {
    return { available: false, kind: "none", reason: (e as Error).message };
  }
}

/** Human label for the device's biometry, so the UI never says "Face ID" on a fingerprint phone. */
export function biometryLabel(kind: BiometryKind): string {
  switch (kind) {
    case "faceId": return "Face ID";
    case "touchId": return "Touch ID";
    case "fingerprint": return "Fingerprint";
    case "face": return "Face Unlock";
    case "iris": return "Iris Unlock";
    default: return "Biometric unlock";
  }
}

export interface AuthResult { ok: boolean; reason?: string; /** user chose the passcode fallback or cancelled out */ cancelled?: boolean }

/**
 * Prompt for biometric authentication.
 *
 * `allowDeviceCredential` lets the user fall back to their phone passcode —
 * on by default, because biometrics fail routinely (gloves, masks, sweat) and
 * a lock with no fallback locks people out of a safety app.
 */
export async function authenticate(reason: string, allowDeviceCredential = true): Promise<AuthResult> {
  if (!isNative()) return { ok: false, reason: "not a native build" };
  try {
    const BiometricAuth = await plugin();
    if (!BiometricAuth) return { ok: false, reason: "biometric plugin not installed" };
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "Cancel",
      allowDeviceCredential,
      iosFallbackTitle: "Use passcode",
      androidTitle: "Unlock CrimeAI",
      androidSubtitle: reason,
      androidConfirmationRequired: false,
    });
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    // The plugin throws on cancel as well as on failure; treat a user-initiated
    // cancel as "not unlocked" rather than as an error worth surfacing.
    const cancelled = /cancel|userFallback|systemCancel/i.test(msg);
    return { ok: false, reason: msg, cancelled };
  }
}
