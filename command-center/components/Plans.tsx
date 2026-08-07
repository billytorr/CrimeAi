"use client";

// Plans — edit what the pricing page shows.
//
// Names, taglines, blurbs, feature bullets, ordering, and the coming-soon
// state all live here so copy changes never need a deploy. Prices too.
//
// ⚠️ Editing an amount changes what NEW subscribers are charged. It does not
// touch anyone already subscribed — their price is pinned by price_id on
// their subscription row. That is deliberate: nobody's bill changes because
// somebody edited a field in an admin portal.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/admin";
import { Badge, Btn, Input, Panel, Select, Td, Th, TextArea } from "@/components/ui";

interface PlanRow {
  id: string; name: string; status: string; tagline: string | null; blurb: string | null;
  features: string[]; sort_order: number; highlight: boolean; active: boolean;
}
interface PriceRow {
  id: string; plan_id: string; amount_cents: number; interval: string; label: string | null; active: boolean;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function Plans() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState<Record<string, Partial<PlanRow>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: pl }, { data: pr }] = await Promise.all([
      supabase.from("tier_plans").select("*").order("sort_order"),
      supabase.from("tier_prices").select("*").order("amount_cents"),
    ]);
    setPlans((pl || []).map((p: any) => ({ ...p, features: Array.isArray(p.features) ? p.features : [] })));
    setPrices(pr || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const edit = (id: string, patch: Partial<PlanRow>) =>
    setDirty((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const valueOf = <K extends keyof PlanRow>(p: PlanRow, k: K): PlanRow[K] =>
    (dirty[p.id]?.[k] ?? p[k]) as PlanRow[K];

  async function savePlan(p: PlanRow) {
    const patch = dirty[p.id];
    if (!patch) return;
    setSaving(p.id);
    const { error } = await supabase.from("tier_plans").update(patch).eq("id", p.id);
    setSaving(null);
    if (error) { alert(`Could not save: ${error.message}`); return; }
    setDirty((d) => { const n = { ...d }; delete n[p.id]; return n; });
    load();
  }

  async function setPriceActive(price: PriceRow, active: boolean) {
    // Deactivating hides a price from checkout; it does NOT cancel anyone on
    // it. Their subscription keeps billing at the amount they agreed to.
    const { error } = await supabase.from("tier_prices").update({ active }).eq("id", price.id);
    if (error) { alert(error.message); return; }
    load();
  }

  const annual = prices.find((p) => p.plan_id === "pro" && p.interval === "year" && p.active);
  const monthly = prices.find((p) => p.plan_id === "pro" && p.interval === "month" && p.active);
  const saving12 = monthly && annual ? monthly.amount_cents * 12 - annual.amount_cents : 0;
  const pctOff = monthly && annual && saving12 > 0 ? Math.round((saving12 / (monthly.amount_cents * 12)) * 100) : 0;
  const monthsFree = monthly && saving12 > 0 ? Math.floor(saving12 / monthly.amount_cents) : 0;

  if (loading) return <div className="p-6 text-sm text-neutral-400">Loading plans…</div>;

  return (
    <div className="space-y-5">
      <Panel title="What the pricing page shows">
        <p className="mb-3 text-xs text-neutral-500">
          Copy and ordering here render directly on the app&apos;s plan comparison. Set a plan to
          <strong className="text-neutral-300"> coming_soon</strong> to show it without a price or a buy button.
        </p>

        {plans.map((p) => {
          const isDirty = !!dirty[p.id];
          const planPrices = prices.filter((x) => x.plan_id === p.id);
          return (
            <div key={p.id} className="mb-3 rounded-lg border border-neutral-800 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Input value={valueOf(p, "name")} onChange={(e) => edit(p.id, { name: e.target.value })} className="max-w-[180px]" />
                <Select value={valueOf(p, "status")} onChange={(e) => edit(p.id, { status: e.target.value })}>
                  <option value="live">live</option>
                  <option value="coming_soon">coming soon</option>
                  <option value="hidden">hidden</option>
                </Select>
                <Input
                  type="number" value={String(valueOf(p, "sort_order"))}
                  onChange={(e) => edit(p.id, { sort_order: Number(e.target.value) })}
                  className="w-20" title="sort order"
                />
                <label className="flex items-center gap-1 text-xs text-neutral-400">
                  <input type="checkbox" checked={!!valueOf(p, "highlight")} onChange={(e) => edit(p.id, { highlight: e.target.checked })} />
                  highlight
                </label>
                <span className="ml-auto flex items-center gap-2">
                  {planPrices.filter((x) => x.active).map((x) => (
                    <Badge key={x.id} tone="ok">{money(x.amount_cents)}/{x.interval === "year" ? "yr" : "mo"}</Badge>
                  ))}
                  {!planPrices.some((x) => x.active) && <Badge tone="muted">no price</Badge>}
                  <Btn small tone={isDirty ? "brand" : "default"} disabled={!isDirty || saving === p.id} onClick={() => savePlan(p)}>
                    {saving === p.id ? "Saving…" : "Save"}
                  </Btn>
                </span>
              </div>

              <Input placeholder="Tagline" value={valueOf(p, "tagline") || ""} onChange={(e) => edit(p.id, { tagline: e.target.value })} />
              <TextArea rows={2} placeholder="Blurb" className="mt-2" value={valueOf(p, "blurb") || ""} onChange={(e) => edit(p.id, { blurb: e.target.value })} />
              <TextArea
                rows={4} className="mt-2"
                placeholder="Feature bullets — one per line"
                value={(valueOf(p, "features") || []).join("\n")}
                onChange={(e) => edit(p.id, { features: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
              />
            </div>
          );
        })}
      </Panel>

      <Panel title="Prices">
        <p className="mb-3 text-xs text-neutral-500">
          Deactivating a price removes it from checkout. It does <strong className="text-neutral-300">not</strong> change
          what existing subscribers pay — their amount is pinned to the price they signed up on.
        </p>
        {monthly && annual && (
          <div className="mb-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-xs text-neutral-400">
            Annual vs monthly, as the app computes it live:{" "}
            <strong className="text-neutral-200">{pctOff}% off</strong>, about{" "}
            <strong className="text-neutral-200">{monthsFree} month{monthsFree === 1 ? "" : "s"} free</strong>{" "}
            ({money(monthly.amount_cents * 12)} → {money(annual.amount_cents)}).
          </div>
        )}
        <table className="w-full text-sm">
          <thead><tr><Th>Price</Th><Th>Plan</Th><Th>Amount</Th><Th>Interval</Th><Th>Label</Th><Th>Status</Th></tr></thead>
          <tbody>
            {prices.map((x) => (
              <tr key={x.id} className="border-t border-neutral-800">
                <Td><span className="font-mono text-xs">{x.id}</span></Td>
                <Td>{x.plan_id}</Td>
                <Td>{money(x.amount_cents)}</Td>
                <Td>{x.interval}</Td>
                <Td><span className="text-xs text-neutral-500">{x.label || "—"}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Badge tone={x.active ? "ok" : "muted"}>{x.active ? "active" : "retired"}</Badge>
                    <Btn small onClick={() => setPriceActive(x, !x.active)}>{x.active ? "Retire" : "Activate"}</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
