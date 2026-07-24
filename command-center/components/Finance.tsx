"use client";

// Finance — the money view: paid vs free users, revenue, payment history,
// editable plan pricing/benefits, and merchant (payment provider) config.
// Accessible to owner, admin, and the dedicated `finance` role.
import { useEffect, useState } from "react";
import { supabase, audit, countOf, timeAgo, type Admin } from "@/lib/admin";
import { Badge, Btn, Input, Panel, Select, StatCard, Td, TextArea, Th } from "@/components/ui";

const PROVIDERS = [
  { id: "none", label: "Not configured" },
  { id: "stripe", label: "Stripe (API-integrated)" },
  { id: "chase", label: "Chase Payment Solutions" },
  { id: "square", label: "Square" },
  { id: "paypal", label: "PayPal" },
  { id: "authorize", label: "Authorize.net" },
  { id: "custom", label: "Custom / other merchant" },
];

export default function Finance({ admin }: { admin: Admin }) {
  const [proUsers, setProUsers] = useState<any[]>([]);
  const [freeCount, setFreeCount] = useState(0);
  const [payments, setPayments] = useState<any[]>([]);
  const [proPlan, setProPlan] = useState<any>(null);
  const [freePlan, setFreePlan] = useState<any>(null);
  const [conf, setConf] = useState<any>(null);
  const [priceStr, setPriceStr] = useState("9.11");
  const [proFeatures, setProFeatures] = useState("");
  const [freeFeatures, setFreeFeatures] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [grantEmail, setGrantEmail] = useState("");
  const [grantMsg, setGrantMsg] = useState("");

  async function load() {
    const [pro, free, pays, plans, pc] = await Promise.all([
      supabase.from("profiles").select("id, name, email, handle, pro_since").eq("plan", "pro").order("pro_since", { ascending: false }),
      countOf("profiles", (q) => q.neq("plan", "pro")),
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("plans").select("*"),
      supabase.from("payment_config").select("*").eq("id", 1).maybeSingle(),
    ]);
    setProUsers(pro.data || []);
    setFreeCount(free);
    setPayments(pays.data || []);
    const p = (plans.data || []).find((x) => x.id === "pro");
    const f = (plans.data || []).find((x) => x.id === "free");
    setProPlan(p); setFreePlan(f);
    if (p) { setPriceStr((p.price_cents / 100).toFixed(2)); setProFeatures((p.features || []).join("\n")); }
    if (f) setFreeFeatures((f.features || []).join("\n"));
    setConf(pc.data);
    setCheckoutUrl(pc.data?.checkout_url || "");
  }
  useEffect(() => { load(); }, []);

  const mrrCents = proUsers.length * (proPlan?.price_cents ?? 911);
  const collectedCents = payments.reduce((s, p) => s + (p.status === "paid" ? p.amount_cents : 0), 0);
  const thisMonth = payments.filter((p) => new Date(p.created_at).getMonth() === new Date().getMonth() && new Date(p.created_at).getFullYear() === new Date().getFullYear());
  const monthCents = thisMonth.reduce((s, p) => s + (p.status === "paid" ? p.amount_cents : 0), 0);
  const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  async function savePlans() {
    setBusy(true); setMsg("");
    const cents = Math.round(parseFloat(priceStr) * 100);
    if (!Number.isFinite(cents) || cents < 0) { setMsg("Invalid price"); setBusy(false); return; }
    const proF = proFeatures.split("\n").map((x) => x.trim()).filter(Boolean);
    const freeF = freeFeatures.split("\n").map((x) => x.trim()).filter(Boolean);
    const [a, b] = await Promise.all([
      supabase.from("plans").update({ price_cents: cents, features: proF, updated_by: admin.email, updated_at: new Date().toISOString() }).eq("id", "pro"),
      supabase.from("plans").update({ features: freeF, updated_by: admin.email, updated_at: new Date().toISOString() }).eq("id", "free"),
    ]);
    setMsg(a.error || b.error ? (a.error?.message || b.error?.message || "Error") : "Saved — live in app Settings and checkout immediately.");
    await audit(admin, "update_plans", `pro $${priceStr}`, {});
    await load();
    setBusy(false);
  }

  async function saveProvider(provider: string) {
    const { error } = await supabase.from("payment_config").update({ provider, updated_by: admin.email, updated_at: new Date().toISOString() }).eq("id", 1);
    if (!error) await audit(admin, "set_payment_provider", provider, {});
    await load();
  }

  async function saveCheckoutUrl() {
    await supabase.from("payment_config").update({ checkout_url: checkoutUrl.trim(), updated_by: admin.email, updated_at: new Date().toISOString() }).eq("id", 1);
    await audit(admin, "set_checkout_url", checkoutUrl.trim().slice(0, 80), {});
    await load();
  }

  // Manual reconciliation — works with ANY merchant: match a payment on
  // the provider's dashboard, then grant here (and revoke on cancellation).
  async function grantProtector() {
    setGrantMsg("");
    const email = grantEmail.trim().toLowerCase();
    if (!email) return;
    const { data: prof } = await supabase.from("profiles").select("id, name").eq("email", email).maybeSingle();
    if (!prof) { setGrantMsg("No account with that email."); return; }
    await supabase.from("profiles").update({ plan: "pro", pro_since: new Date().toISOString() }).eq("id", prof.id);
    await audit(admin, "grant_protector", email, { manual: true });
    setGrantMsg(`${prof.name} is now a Protector.`);
    setGrantEmail("");
    await load();
  }

  async function revokeProtector(u: any) {
    if (!window.confirm(`Remove Protector status from ${u.name}? (Use when a subscription is canceled or refunded.)`)) return;
    await supabase.from("profiles").update({ plan: "free" }).eq("id", u.id);
    await audit(admin, "revoke_protector", u.email, { manual: true });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Protector members" value={proUsers.length} tone="ok" />
        <StatCard label="Free members" value={freeCount} />
        <StatCard label="MRR" value={usd(mrrCents)} sub={`${proUsers.length} × ${usd(proPlan?.price_cents ?? 911)}`} tone="ok" />
        <StatCard label="Collected this month" value={usd(monthCents)} />
        <StatCard label="Collected all-time" value={usd(collectedCents)} sub={`${payments.length} payments`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Merchant / payment provider">
          <div className="flex items-center gap-3">
            <Select value={conf?.provider || "none"} onChange={(e) => saveProvider(e.target.value)}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
            <Badge tone={conf?.provider === "none" || !conf ? "warn" : "ok"}>{conf?.provider === "none" || !conf ? "checkout disabled" : "selected"}</Badge>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink2">
            The checkout at <span className="text-ink">pay.publicsafetycrimecenter.com/crimeai/checkout</span> uses whichever
            provider is selected here. Secret API keys are never stored in this database — they go in the server&apos;s
            environment variables (Vercel → Settings → Environment Variables):
          </p>
          <ul className="mt-2 space-y-1 text-xs text-ink3">
            <li>• <span className="text-ink2">Stripe (API-integrated):</span> set <span className="font-mono">STRIPE_SECRET_KEY</span>, <span className="font-mono">STRIPE_WEBHOOK_SECRET</span>, <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> — checkout, renewals and cancellations are fully automatic</li>
            <li>• <span className="text-ink2">Any other merchant (Chase, Square, PayPal, Authorize.net, custom):</span> paste the provider&apos;s hosted checkout / payment-link URL below — users are sent there with their account reference attached; reconcile completed payments with Grant/Revoke on this page</li>
          </ul>
          {conf?.provider && conf.provider !== "none" && conf.provider !== "stripe" && (
            <div className="mt-3 flex items-center gap-2">
              <Input placeholder="https://… the merchant's hosted checkout URL" value={checkoutUrl} onChange={(e) => setCheckoutUrl(e.target.value)} />
              <Btn onClick={saveCheckoutUrl}>Save URL</Btn>
            </div>
          )}
        </Panel>

        <Panel title="Plan configuration (live in app + checkout)">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-40 text-xs font-semibold uppercase tracking-wide text-ink3">Protector price/mo $</span>
              <Input value={priceStr} onChange={(e) => setPriceStr(e.target.value)} className="max-w-[110px]" />
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink3">Protector benefits (one per line)</span>
              <TextArea rows={5} value={proFeatures} onChange={(e) => setProFeatures(e.target.value)} />
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink3">Free plan benefits (one per line)</span>
              <TextArea rows={4} value={freeFeatures} onChange={(e) => setFreeFeatures(e.target.value)} />
            </div>
            {msg && <p className={`text-sm ${msg.startsWith("Saved") ? "text-ok" : "text-brand"}`}>{msg}</p>}
            <Btn tone="brand" onClick={savePlans} disabled={busy}>{busy ? "Saving…" : "Save plans"}</Btn>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={`Protector members (${proUsers.length})`} action={
          <div className="flex items-center gap-1.5">
            <Input placeholder="grant by email…" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} className="w-52" />
            <Btn small tone="ok" onClick={grantProtector}>Grant</Btn>
          </div>
        }>
          {grantMsg && <p className="mb-2 text-xs text-ok">{grantMsg}</p>}
          {!proUsers.length ? <p className="py-8 text-center text-sm text-ink3">No paid members yet — they&apos;ll appear here the moment the first checkout completes.</p> : (
            <div className="max-h-[40vh] overflow-auto">
              <table className="w-full">
                <thead><tr className="border-b border-line"><Th>Member</Th><Th>Handle</Th><Th>Protector since</Th><Th>{" "}</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {proUsers.map((u) => (
                    <tr key={u.id}>
                      <Td><div className="font-medium">{u.name}</div><div className="text-xs text-ink3">{u.email}</div></Td>
                      <Td className="text-ink2">@{u.handle || "—"}</Td>
                      <Td className="text-ink3">{u.pro_since ? timeAgo(u.pro_since) : "—"}</Td>
                      <Td><Btn small tone="danger" onClick={() => revokeProtector(u)}>Revoke</Btn></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={`Payments (${payments.length})`}>
          {!payments.length ? <p className="py-8 text-center text-sm text-ink3">No payments recorded yet.</p> : (
            <div className="max-h-[40vh] overflow-auto">
              <table className="w-full">
                <thead><tr className="border-b border-line"><Th>When</Th><Th>Who</Th><Th>Amount</Th><Th>Type</Th><Th>Status</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <Td className="whitespace-nowrap text-ink3">{timeAgo(p.created_at)}</Td>
                      <Td className="text-ink2">{p.email || p.user_id?.slice(0, 8)}</Td>
                      <Td className="font-semibold">{usd(p.amount_cents)}</Td>
                      <Td><Badge tone="blue">{p.kind}</Badge></Td>
                      <Td><Badge tone={p.status === "paid" ? "ok" : "warn"}>{p.status}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
