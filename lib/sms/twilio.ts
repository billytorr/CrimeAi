// Thin Twilio adapter (HTTP API — no SDK dependency). DORMANT-SAFE: without
// TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM it no-ops and reports
// { sent:false, skipped }, so the code path can ship before the account exists.
//
// ⚠️ Rule 1: this file is the NON-CRITICAL alert-SMS transport. Safety
// dispatch (SOS / Trusted-Circle emergency fan-out), when it gets a server
// backend, must use its OWN ungated path and be added to SAFETY_FILES — it
// must never route through lib/sms/alerts.ts (which meters usage).

export interface SmsResult { sent: boolean; sid?: string; skipped?: string; error?: string }

export function smsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return { sent: false, skipped: "twilio not configured" };
  if (!/^\+?[0-9][0-9 ()-]{6,}$/.test(to)) return { sent: false, skipped: "invalid recipient number" };

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1600) }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { sent: false, error: data?.message || `twilio ${res.status}` };
    return { sent: true, sid: data?.sid };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}
