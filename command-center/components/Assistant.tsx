"use client";

// Assistant — configure CrimeAI's brain without a deploy.
//
// Every row is an ai_config key: the model, the persona/system prompt,
// temperature, and the per-tier monthly allowances. Editing the system
// prompt here changes how the assistant talks to every user within a minute
// (the app-side loader caches for 60s).
//
// No secret lives here — the Anthropic API key stays an environment variable.
// This panel only tunes behaviour and limits.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/admin";
import { Btn, Input, Panel, TextArea } from "@/components/ui";

interface Row { key: string; value: any; description: string | null }

const NUMERIC = new Set([
  "temperature", "max_tokens", "free_monthly_messages", "protector_monthly_messages",
  "protector_voice_minutes", "protector_uploads", "protector_web_searches",
]);
const BOOL = new Set(["free_web_search"]);
const LONG = new Set(["system_prompt", "upsell_line"]);

export default function Assistant({ admin }: { admin: { id: string } }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("ai_config").select("key, value, description").order("key");
    setRows((data || []) as Row[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const valueOf = (r: Row) => (r.key in dirty ? dirty[r.key] : r.value);
  const edit = (k: string, v: any) => setDirty((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true);
    const updates = Object.entries(dirty).map(([key, value]) =>
      supabase.from("ai_config").update({ value, updated_by: admin.id, updated_at: new Date().toISOString() }).eq("key", key),
    );
    const results = await Promise.all(updates);
    setSaving(false);
    const err = results.find((r) => r.error);
    if (err?.error) { alert(`Save failed: ${err.error.message}`); return; }
    setDirty({});
    setSaved("Saved — live within a minute.");
    setTimeout(() => setSaved(""), 2500);
    load();
  }

  if (loading) return <div className="p-6 text-sm text-neutral-400">Loading assistant config…</div>;

  const group = (keys: string[]) => rows.filter((r) => keys.includes(r.key));
  const engine = group(["model", "temperature", "max_tokens"]);
  const persona = group(["system_prompt", "upsell_line"]);
  const limits = group([
    "free_monthly_messages", "protector_monthly_messages", "protector_voice_minutes",
    "protector_uploads", "protector_web_searches", "free_web_search",
  ]);

  const Field = (r: Row) => (
    <div key={r.key} className="mb-3">
      <label className="mb-1 block text-xs font-medium text-neutral-300">{r.key}</label>
      {r.description && <p className="mb-1 text-[11px] text-neutral-500">{r.description}</p>}
      {LONG.has(r.key) ? (
        <TextArea rows={r.key === "system_prompt" ? 14 : 2} value={String(valueOf(r) ?? "")} onChange={(e) => edit(r.key, e.target.value)} />
      ) : BOOL.has(r.key) ? (
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={valueOf(r) === true} onChange={(e) => edit(r.key, e.target.checked)} />
          {valueOf(r) === true ? "enabled" : "disabled"}
        </label>
      ) : NUMERIC.has(r.key) ? (
        <Input type="number" step={r.key === "temperature" ? "0.05" : "1"} value={String(valueOf(r) ?? 0)}
          onChange={(e) => edit(r.key, Number(e.target.value))} className="max-w-[160px]" />
      ) : (
        <Input value={String(valueOf(r) ?? "")} onChange={(e) => edit(r.key, e.target.value)} />
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">Tunes CrimeAI's behaviour and per-tier limits live. The API key stays an env var — nothing secret here.</p>
        <span className="flex items-center gap-3">
          {saved && <span className="text-xs text-green-400">{saved}</span>}
          <Btn tone={Object.keys(dirty).length ? "brand" : "default"} disabled={!Object.keys(dirty).length || saving} onClick={save}>
            {saving ? "Saving…" : `Save ${Object.keys(dirty).length || ""}`.trim()}
          </Btn>
        </span>
      </div>

      <Panel title="Engine">{engine.map(Field)}</Panel>
      <Panel title="Persona & upsell">{persona.map(Field)}</Panel>
      <Panel title="Per-tier limits">{limits.map(Field)}</Panel>
    </div>
  );
}
