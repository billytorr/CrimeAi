// Client view of the caller's verification state.
//
// One source of truth for both surfaces that care: the red check beside a
// name, and the gate on crime reporting. If those ever disagree, a user
// sees a badge but cannot report, or reports without a badge.

"use client";

import { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "@/lib/api";

export type VerificationStatus = "none" | "pending" | "approved" | "rejected" | "expired" | "revoked";

export interface VerificationState {
  verified: boolean;
  status: VerificationStatus;
  reason: string | null;
  vendorConfigured: boolean;
  loading: boolean;
}

const IDLE: VerificationState = { verified: false, status: "none", reason: null, vendorConfigured: false, loading: true };

export async function fetchVerification(): Promise<Omit<VerificationState, "loading">> {
  try {
    const res = await fetch(apiUrl("/api/me/verification"), { headers: await authHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    return {
      verified: !!d.verified,
      status: (d.status || "none") as VerificationStatus,
      reason: d.reason ?? null,
      vendorConfigured: !!d.vendorConfigured,
    };
  } catch {
    // Fail CLOSED for the badge — claiming someone is verified when we
    // could not check is the one wrong answer. The report gate reads the
    // same value, and refusing a report is recoverable; a false badge is not.
    return { verified: false, status: "none", reason: null, vendorConfigured: false };
  }
}

export function useVerification(): VerificationState {
  const [state, setState] = useState<VerificationState>(IDLE);
  useEffect(() => {
    let cancelled = false;
    fetchVerification().then((v) => { if (!cancelled) setState({ ...v, loading: false }); });
    return () => { cancelled = true; };
  }, []);
  return state;
}

/** Record consent (or refusal) and open a verification. */
export async function startVerification(
  consent: boolean,
): Promise<{ ok: boolean; pendingVendor?: boolean; alreadyPending?: boolean; message?: string; code?: string }> {
  try {
    const res = await fetch(apiUrl("/api/me/verification"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ consent }),
    });
    const d = await res.json().catch(() => ({}));
    return {
      ok: !!d.ok,
      pendingVendor: !!d.pendingVendor,
      alreadyPending: !!d.alreadyPending,
      // `message` is the friendly not-yet-switched-on copy; `error` is a real
      // failure. Reading only `message` was throwing away the one string that
      // said what actually went wrong.
      message: d.message || d.error,
      code: d.code,
    };
  } catch {
    return { ok: false, message: "Couldn't reach the server — check your connection and try again." };
  }
}
