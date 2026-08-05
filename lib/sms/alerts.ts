// Non-critical alert SMS — the `sms_immediate` COST path. Every send is
// atomically metered via enforceConsume (always enforced; the kill switch
// cannot open per-message spend). Fail-closed to free behavior: a metering
// failure means NO paid SMS goes out (the alert still reaches the user via
// free channels like push — never nothing, never unbounded spend).
//
// ⚠️ Rule 1: NEVER use this for SOS / Trusted-Circle emergency dispatch or
// critical-severity alerts — those are safety paths and must be ungated.
import { enforceConsume } from "@/lib/entitlements/enforce";
import { sendSms, smsConfigured, type SmsResult } from "./twilio";

export async function sendAlertSms(userId: string, to: string, body: string): Promise<SmsResult & { metered: boolean }> {
  if (!smsConfigured()) return { sent: false, skipped: "twilio not configured", metered: false };
  const meter = await enforceConsume(userId, "sms_immediate");
  if (!meter.allowed) {
    return { sent: false, skipped: `sms allowance exhausted (${meter.reason || "limit_reached"})`, metered: true };
  }
  return { ...(await sendSms(to, body)), metered: true };
}
