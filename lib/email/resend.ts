// Thin Resend adapter (HTTP API — no SDK dependency). Auth emails go through
// Supabase's SMTP (also Resend); THESE are our own transactional payment
// emails sent directly via the Resend API.
//
// DORMANT-SAFE: if RESEND_API_KEY is unset, sendEmail() no-ops and returns
// { sent:false } — so the whole payment flow can ship and run before the key
// exists, without ever throwing or blocking a webhook/checkout.

export interface SendResult { sent: boolean; id?: string; skipped?: string; error?: string }

export function emailFrom(): string {
  // Default sends from the ROOT domain verified in Resend. Override with
  // PAYMENTS_EMAIL_FROM to use a different verified domain/subdomain.
  return process.env.PAYMENTS_EMAIL_FROM || "CrimeAI <receipts@publicsafetycrimecenter.com>";
}

export async function sendEmail(opts: { to: string; subject: string; html: string; replyTo?: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, skipped: "no RESEND_API_KEY" };
  if (!opts.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(opts.to)) return { sent: false, skipped: "no valid recipient" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: emailFrom(),
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { sent: false, error: body?.message || `resend ${res.status}` };
    return { sent: true, id: body?.id };
  } catch (e) {
    // Email must never break the payment path — log and move on.
    return { sent: false, error: (e as Error).message };
  }
}
