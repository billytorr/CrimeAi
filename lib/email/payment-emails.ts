// Branded transactional payment emails (welcome / receipt / payment-failed /
// canceled). All send through the Resend adapter, which is dormant-safe until
// RESEND_API_KEY exists. Content is intentionally simple, inline-styled HTML
// (email clients strip <style>/external CSS).
import { sendEmail, type SendResult } from "./resend";

const BRAND = "#e5484d";
const APP = process.env.NEXT_PUBLIC_APP_BASE || "https://app.publicsafetycrimecenter.com";

function shell(heading: string, bodyHtml: string): string {
  return `<div style="margin:0;padding:24px;background:#0a0b10;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#14161d;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.08)">
    <div style="padding:22px 24px;border-bottom:1px solid rgba(255,255,255,.08)">
      <span style="display:inline-block;width:26px;height:26px;background:${BRAND};border-radius:7px;vertical-align:middle"></span>
      <span style="color:#fff;font-weight:700;font-size:15px;margin-left:8px;vertical-align:middle">CrimeAI · Public Safety Crime Center</span>
    </div>
    <div style="padding:24px">
      <h1 style="color:#fff;font-size:19px;margin:0 0 12px">${heading}</h1>
      <div style="color:#c7ccd6;font-size:14px;line-height:1.6">${bodyHtml}</div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid rgba(255,255,255,.08);color:#8a90a0;font-size:11px;line-height:1.5">
      Informational only. In an emergency, call 911.<br>BlackSeed Labs / TORR AI
    </div>
  </div>
</div>`;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function sendProtectorWelcome(to: string, opts: { amountCents: number }): Promise<SendResult> {
  return sendEmail({
    to, subject: "You're a Protector 🛡️",
    html: shell("You're a Protector 🛡️", `
      <p>Your CrimeAI Protector plan is active — <strong style="color:#fff">${money(opts.amountCents)}/mo</strong>.</p>
      <p>Your red Protector badge is live, and you've unlocked 90-day map history, saved locations, wider alerts, address search, SMS alerts and the full Safety Score.</p>
      <p style="margin-top:20px"><a href="${APP}" style="background:${BRAND};color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700;font-size:14px;display:inline-block">Open CrimeAI</a></p>
      <p style="color:#8a90a0;font-size:12px;margin-top:18px">Cancel anytime. This isn't a receipt — your card statement will show the charge separately.</p>`),
  });
}

export function sendPaymentReceipt(to: string, opts: { amountCents: number; dateISO: string; cardBrand?: string | null; last4?: string | null }): Promise<SendResult> {
  const card = opts.cardBrand && opts.last4 ? `${opts.cardBrand} ····${opts.last4}` : "your card on file";
  const date = opts.dateISO ? new Date(opts.dateISO).toUTCString().slice(0, 16) : "";
  return sendEmail({
    to, subject: `Receipt — CrimeAI Protector ${money(opts.amountCents)}`,
    html: shell("Payment receipt", `
      <p>Thanks for being a Protector. Here's your receipt.</p>
      <table style="width:100%;border-collapse:collapse;margin:14px 0">
        <tr><td style="padding:6px 0;color:#8a90a0">Plan</td><td style="padding:6px 0;color:#fff;text-align:right">CrimeAI Protector</td></tr>
        <tr><td style="padding:6px 0;color:#8a90a0">Amount</td><td style="padding:6px 0;color:#fff;text-align:right">${money(opts.amountCents)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a90a0">Date</td><td style="padding:6px 0;color:#fff;text-align:right">${date}</td></tr>
        <tr><td style="padding:6px 0;color:#8a90a0">Payment</td><td style="padding:6px 0;color:#fff;text-align:right">${card}</td></tr>
      </table>
      <p style="color:#8a90a0;font-size:12px">Statement descriptor: PSCC-CRIMEAI PRO PLAN</p>`),
  });
}

export function sendPaymentFailed(to: string, opts: { graceUntilISO: string | null }): Promise<SendResult> {
  const until = opts.graceUntilISO ? new Date(opts.graceUntilISO).toUTCString().slice(0, 16) : "soon";
  return sendEmail({
    to, subject: "Action needed: your Protector payment didn't go through",
    html: shell("Your payment didn't go through", `
      <p>We couldn't process your latest CrimeAI Protector charge — usually an expired card or insufficient funds.</p>
      <p><strong style="color:#fff">Your Protector access stays on until ${until}.</strong> Update your card before then to avoid interruption.</p>
      <p style="margin-top:20px"><a href="${APP}/crimeai/pricing/checkout" style="background:${BRAND};color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700;font-size:14px;display:inline-block">Update payment</a></p>`),
  });
}

export function sendSubscriptionCanceled(to: string): Promise<SendResult> {
  return sendEmail({
    to, subject: "Your CrimeAI Protector plan was canceled",
    html: shell("Protector canceled", `
      <p>Your CrimeAI Protector subscription has been canceled and you're back on the free plan. Your account and history are unchanged.</p>
      <p>You can become a Protector again anytime.</p>
      <p style="margin-top:20px"><a href="${APP}/crimeai/pricing/checkout" style="background:${BRAND};color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700;font-size:14px;display:inline-block">Reactivate</a></p>`),
  });
}
