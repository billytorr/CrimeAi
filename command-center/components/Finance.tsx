"use client";

// Finance — wired to the LIVE tier system (tier_prices / tier_limits /
// tier_subscriptions / enforcement_flags), the same tables the checkout and
// entitlement engine read. Changes here are live in the app without a deploy.
// The legacy `plans` table remains only as display copy (benefit bullets).
import { useEffect, useMemo, useState } from "react";
import { supabase, audit, countOf, timeAgo, type Admin } from "@/lib/admin";
import { Badge, Btn, Input, Panel, StatCard, Td, TextArea, Th } from "@/components/ui";

const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

// Friendly labels + expected value format for the limits editor.
const CAP_INFO: Record<string, { label: string; hint: string }> = {
  ai_analytical: { label: "AI questions / month", hint: "number (metered, costs money)" },
  address_search: { label: "Address searches / month", hint: "number" },
  sms_immediate: { label: "SMS alerts / month", hint: "number (metered, costs money)" },
  map_history_days: { label: "Map history (days)", hint: "number" },
  saved_locations: { label: "Saved locations", hint: "number" },
  trusted_circle: { label: "Trusted-circle contacts", hint: "number" },
  alert_radius: { label: "Alert radius", hint: "JSON object" },
  channels: { label: "Alert channels", hint: '["push","email","sms"]' },
  safety_score_depth: { label: "Safety Score depth", hint: '"current" or "full"' },
  protector_badge: { label: "Protector badge", hint: "true / false" },
  priority_visibility: { label: "Priority visibility", hint: "true / false" },
  early_access: { label: "Early access", hint: "true / false" },
};
const CAP_ORDER = Object.keys(CAP_INFO);

const LIVE_STATUSES = ["active", "grace", "past_due"];

export default function Finance({ admin }: { admin: Admin }) {
  const [subs, setSubs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [freeCount, setFreeCount] = useState(0);
  const [prices, setPrices] = useState<any[]>([]);
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [limits, setLimits] = useState<any[]>([]);
  const [limitEdits, setLimitEdits] = useState<Record<string, string>>({});
  const [enforcement, setEnforcement] = useState<boolean | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [benefits, setBenefits] = useState({ pro: "", free: "" });
  const [grantEmail, setGrantEmail] = useState("");
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const say = (k: string, v: string) => setMsg((m) => ({ ...m, [k]: v }));

  async function load() {
    const [subsQ, pricesQ, limitsQ, flagQ, evQ, plansQ] = await Promise.all([
      supabase.from("tier_subscriptions").select("*").order("updated_at", { ascending: false }),
      supabase.from("tier_prices").select("*").order("amount_cents"),
      supabase.from("tier_limits").select("*"),
      supabase.from("enforcement_flags").select("enabled").eq("market", "default").maybeSingle(),
      supabase.from("payment_webhook_events").select("notification_id, event_type, subscription_id, status, received_at").order("received_at", { ascending: false }).limit(100),
      supabase.from("plans").select("id, features"),
    ]);
    const s = subsQ.data || [];
    setSubs(s);
    setPrices(pricesQ.data || []);
    setLimits(limitsQ.data || []);
    setEnforcement(flagQ.data ? flagQ.data.enabled === true : null);
    setEvents(evQ.data || []);
    const pf = (plansQ.data || []).find((x: any) => x.id === "pro");
    const ff = (plansQ.data || []).find((x: any) => x.id === "free");
    setBenefits({ pro: (pf?.features || []).join("\n"), free: (ff?.features || []).join("\n") });

    // join member profiles (no FK between tier_subscriptions and profiles)
    const ids = s.map((x: any) => x.user_id);
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, name, email, handle").in("id", ids);
      setProfiles(Object.fromEntries((profs || []).map((p: any) => [p.id, p])));
    }
    setFreeCount(await countOf("profiles", (q) => q));
  }
  useEffect(() => { load(); }, []);

  const liveSubs = useMemo(() => subs.filter((s) => LIVE_STATUSES.includes(s.status)), [subs]);
  const priceById = useMemo(() => Object.fromEntries(prices.map((p) => [p.id, p])), [prices]);
  const mrrCents = liveSubs.reduce((sum, s) => sum + (priceById[s.price_id]?.amount_cents || 0), 0);
  const pastDue = subs.filter((s) => s.status === "past_due").length;

  // ── enforcement kill switch ─────────────────────────────────────
  async function toggleEnforcement() {
    const next = !enforcement;
    const { error } = await supabase.from("enforcement_flags").update({ enabled: next, updated_at: new Date().toISOString() }).eq("market", "default");
    if (error) { say("enforce", error.message.includes("row") || error.message.includes("policy") ? "Owner/admin only." : error.message); return; }
    await audit(admin, "tier_enforcement", next ? "ENABLED" : "disabled", {});
    setEnforcement(next);
    say("enforce", next ? "Enforcement ON — free-tier limits are live (takes ≤30s)." : "Enforcement OFF — everyone gets full access (cost caps on AI/SMS stay active).");
  }

  // ── pricing ─────────────────────────────────────────────────────
  async function savePrice(p: any) {
    const raw = priceEdits[p.id] ?? (p.amount_cents / 100).toFixed(2);
    const cents = Math.round(parseFloat(raw) * 100);
    if (!Number.isFinite(cents) || cents < 0) { say("price", "Invalid amount."); return; }
    const { error } = await supabase.from("tier_prices").update({ amount_cents: cents }).eq("id", p.id);
    say("price", error ? error.message : `${p.id} → ${usd(cents)}. New checkouts use this immediately; existing subscribers keep their locked-in price.`);
    if (!error) await audit(admin, "tier_price", `${p.id}=${usd(cents)}`, {});
    await load();
  }
  async function togglePriceActive(p: any) {
    const activeCount = prices.filter((x) => x.active && x.plan_id === "pro").length;
    if (p.active && activeCount <= 1) { say("price", "At least one price must stay active."); return; }
    const { error } = await supabase.from("tier_prices").update({ active: !p.active }).eq("id", p.id);
    if (!error) await audit(admin, "tier_price_active", `${p.id}=${!p.active}`, {});
    say("price", error ? error.message : `${p.id} ${!p.active ? "activated" : "deactivated"}. Multiple active prices = automatic A/B test.`);
    await load();
  }

  // ── limits ──────────────────────────────────────────────────────
  const limitKey = (plan: string, cap: string) => `${plan}:${cap}`;
  const limitValue = (plan: string, cap: string) => {
    const row = limits.find((l) => l.plan_id === plan && l.capability === cap);
    return row ? JSON.stringify(row.value) : "";
  };
  async function saveLimits() {
    setBusy(true); say("limits", "");
    const changes: { plan: string; cap: string; value: any }[] = [];
    for (const [key, raw] of Object.entries(limitEdits)) {
      const [plan, cap] = key.split(":");
      if (raw === limitValue(plan, cap)) continue;
      try { changes.push({ plan, cap, value: JSON.parse(raw) }); }
      catch { say("limits", `"${raw}" isn't valid — use a number, true/false, "text", or a JSON list.`); setBusy(false); return; }
    }
    for (const c of changes) {
      const { error } = await supabase.from("tier_limits").update({ value: c.value }).eq("plan_id", c.plan).eq("capability", c.cap);
      if (error) { say("limits", error.message); setBusy(false); return; }
      await audit(admin, "tier_limit", `${c.plan}.${c.cap}=${JSON.stringify(c.value)}`, {});
    }
    say("limits", changes.length ? `Saved ${changes.length} limit${changes.length > 1 ? "s" : ""} — live in the app within a minute, no deploy.` : "No changes.");
    setLimitEdits({});
    await load();
    setBusy(false);
  }

  // ── benefits display copy (legacy plans table, app Settings card) ──
  async function saveBenefits() {
    const proF = benefits.pro.split("\n").map((x) => x.trim()).filter(Boolean);
    const freeF = benefits.free.split("\n").map((x) => x.trim()).filter(Boolean);
    await Promise.all([
      supabase.from("plans").update({ features: proF, updated_by: admin.email, updated_at: new Date().toISOString() }).eq("id", "pro"),
      supabase.from("plans").update({ features: freeF, updated_by: admin.email, updated_at: new Date().toISOString() }).eq("id", "free"),
    ]);
    await audit(admin, "plan_benefits", "updated", {});
    say("benefits", "Saved — shown on the app's upgrade card.");
  }

  // ── manual grant / revoke (comp accounts, refunds) ──────────────
  async function grantProtector() {
    say("grant", "");
    const email = grantEmail.trim().toLowerCase();
    if (!email) return;
    const { data: prof } = await supabase.from("profiles").select("id, name").eq("email", email).maybeSingle();
    if (!prof) { say("grant", "No account with that email."); return; }
    const now = new Date().toISOString();
    const { error } = await supabase.from("tier_subscriptions").upsert({
      user_id: prof.id, plan_id: "pro", price_id: null, status: "active",
      current_period_start: now, grace_until: null, updated_at: now,
    }, { onConflict: "user_id" });
    if (error) { say("grant", error.message); return; }
    await supabase.from("profiles").update({ plan: "pro", pro_since: now }).eq("id", prof.id); // legacy display sync
    await audit(admin, "grant_protector", email, { manual: true });
    say("grant", `${prof.name} is now a Protector (comped — no billing).`);
    setGrantEmail("");
    await load();
  }
  async function revokeProtector(s: any) {
    const who = profiles[s.user_id]?.name || s.user_id.slice(0, 8);
    if (!window.confirm(`Remove Protector from ${who}?${s.anet_subscription_id ? "\n\nNOTE: this does NOT cancel their Authorize.Net billing — cancel the subscription in the Authorize.Net dashboard too, or they'll keep being charged." : ""}`)) return;
    await supabase.from("tier_subscriptions").update({ status: "canceled", grace_until: null, updated_at: new Date().toISOString() }).eq("user_id", s.user_id);
    await supabase.from("profiles").update({ plan: "free" }).eq("id", s.user_id); // legacy display sync
    await audit(admin, "revoke_protector", profiles[s.user_id]?.email || s.user_id, { manual: true });
    await load();
  }

  const statusTone = (s: string) => (s === "active" ? "ok" : s === "past_due" || s === "grace" ? "warn" : "muted") as "ok" | "warn" | "muted";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Protector members" value={liveSubs.length} tone="ok" />
        <StatCard label="MRR" value={usd(mrrCents)} sub="sum of live subscriptions" tone="ok" />
        <StatCard label="Past due (dunning)" value={pastDue} tone={pastDue ? "warn" : undefined} />
        <StatCard label="All accounts" value={freeCount} />
        <StatCard label="Tier enforcement" value={enforcement == null ? "—" : enforcement ? "ON" : "OFF"} tone={enforcement ? "ok" : "warn"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Tier enforcement (kill switch)">
          <div className="flex items-center gap-3">
            <Btn tone={enforcement ? "danger" : "ok"} onClick={toggleEnforcement}>
              {enforcement ? "Disable enforcement" : "Enable enforcement"}
            </Btn>
            <Badge tone={enforcement ? "ok" : "warn"}>{enforcement == null ? "unknown" : enforcement ? "free-tier limits LIVE" : "limits not enforced"}</Badge>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink2">
            OFF = everyone gets full access (safe rollout / break-glass). ON = free accounts are held to the limits below.
            Either way, the paid AI and SMS caps stay enforced — the switch can never open unlimited spend.
            Safety features (SOS, 911, Walk-with-me, Trusted-Circle alerts) are never gated, ever.
          </p>
          {msg.enforce && <p className="mt-2 text-xs text-ok">{msg.enforce}</p>}
        </Panel>

        <Panel title="Pricing (live at checkout)">
          <div className="space-y-2">
            {prices.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-20 font-mono text-xs text-ink3">{p.id}</span>
                <span className="text-ink3">$</span>
                <Input className="max-w-[90px]" value={priceEdits[p.id] ?? (p.amount_cents / 100).toFixed(2)}
                  onChange={(e) => setPriceEdits((x) => ({ ...x, [p.id]: e.target.value }))} />
                <Btn small onClick={() => savePrice(p)}>Save</Btn>
                <Btn small tone={p.active ? "danger" : "ok"} onClick={() => togglePriceActive(p)}>{p.active ? "Deactivate" : "Activate"}</Btn>
                <Badge tone={p.active ? "ok" : "muted"}>{p.active ? "active" : "inactive"}</Badge>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink2">
            Changes apply to <em>new</em> checkouts instantly (no deploy). Existing subscribers keep the price they signed up at,
            for the life of their subscription. Multiple active prices split new signups automatically (A/B test).
          </p>
          {msg.price && <p className="mt-2 text-xs text-ok">{msg.price}</p>}
        </Panel>
      </div>

      <Panel title="Plan limits (what each tier gets)" action={<Btn tone="brand" small onClick={saveLimits} disabled={busy}>{busy ? "Saving…" : "Save limits"}</Btn>}>
        <div className="max-h-[46vh] overflow-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line"><Th>Capability</Th><Th>Free</Th><Th>Protector</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {CAP_ORDER.map((cap) => (
                <tr key={cap}>
                  <Td><div className="font-medium">{CAP_INFO[cap].label}</div><div className="text-[11px] text-ink3">{CAP_INFO[cap].hint}</div></Td>
                  {["free", "pro"].map((plan) => (
                    <Td key={plan}>
                      <Input className="min-w-[110px] font-mono text-xs"
                        value={limitEdits[limitKey(plan, cap)] ?? limitValue(plan, cap)}
                        onChange={(e) => setLimitEdits((x) => ({ ...x, [limitKey(plan, cap)]: e.target.value }))} />
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {msg.limits && <p className={`mt-2 text-xs ${msg.limits.startsWith("Saved") || msg.limits === "No changes." ? "text-ok" : "text-brand"}`}>{msg.limits}</p>}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={`Protector members (${liveSubs.length})`} action={
          <div className="flex items-center gap-1.5">
            <Input placeholder="comp by email…" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} className="w-52" />
            <Btn small tone="ok" onClick={grantProtector}>Grant</Btn>
          </div>
        }>
          {msg.grant && <p className="mb-2 text-xs text-ok">{msg.grant}</p>}
          {!subs.length ? <p className="py-8 text-center text-sm text-ink3">No subscriptions yet — members appear the moment a checkout completes.</p> : (
            <div className="max-h-[40vh] overflow-auto">
              <table className="w-full">
                <thead><tr className="border-b border-line"><Th>Member</Th><Th>Status</Th><Th>Price</Th><Th>Card</Th><Th>{" "}</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {subs.map((s) => {
                    const p = profiles[s.user_id];
                    return (
                      <tr key={s.user_id}>
                        <Td><div className="font-medium">{p?.name || s.user_id.slice(0, 8)}</div><div className="text-xs text-ink3">{p?.email || (s.receipt_email ?? "—")}</div></Td>
                        <Td><Badge tone={statusTone(s.status)}>{s.status}</Badge>{s.status === "past_due" && s.grace_until && <div className="mt-0.5 text-[11px] text-ink3">grace to {new Date(s.grace_until).toLocaleDateString()}</div>}</Td>
                        <Td className="text-ink2">{s.price_id ? usd(priceById[s.price_id]?.amount_cents || 0) : <Badge tone="blue">comped</Badge>}</Td>
                        <Td className="text-ink3">{s.card_brand ? `${s.card_brand} ····${s.card_last4}` : "—"}</Td>
                        <Td>{LIVE_STATUSES.includes(s.status) && <Btn small tone="danger" onClick={() => revokeProtector(s)}>Revoke</Btn>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={`Billing events (${events.length})`}>
          {!events.length ? <p className="py-8 text-center text-sm text-ink3">Authorize.Net events (charges, cancellations, failed payments) appear here as they arrive.</p> : (
            <div className="max-h-[40vh] overflow-auto">
              <table className="w-full">
                <thead><tr className="border-b border-line"><Th>When</Th><Th>Event</Th><Th>Subscription</Th><Th>Status</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {events.map((e) => (
                    <tr key={e.notification_id}>
                      <Td className="whitespace-nowrap text-ink3">{timeAgo(e.received_at)}</Td>
                      <Td className="text-ink2">{String(e.event_type || "").replace("net.authorize.", "")}</Td>
                      <Td className="font-mono text-xs text-ink3">{e.subscription_id || "—"}</Td>
                      <Td><Badge tone={e.status === "processed" ? "ok" : e.status === "error" ? "bad" : "muted"}>{e.status}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Upgrade-card copy (app Settings)">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink3">Protector benefits (one per line)</span>
            <TextArea rows={4} value={benefits.pro} onChange={(e) => setBenefits((b) => ({ ...b, pro: e.target.value }))} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink3">Free plan blurb (one per line)</span>
            <TextArea rows={4} value={benefits.free} onChange={(e) => setBenefits((b) => ({ ...b, free: e.target.value }))} />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Btn small tone="brand" onClick={saveBenefits}>Save copy</Btn>
          {msg.benefits && <p className="text-xs text-ok">{msg.benefits}</p>}
        </div>
      </Panel>
    </div>
  );
}
