"use client";

// Verifications — the ID review queue.
//
// Approving here is what lights up the red check on a profile and unlocks
// crime reporting for that person. It is the single highest-trust action in
// the portal: a wrongly approved account can file reports that neighbors
// act on.
//
// ⚠️ NO DOCUMENTS ARE SHOWN OR STORED HERE. The reviewer sees the vendor's
// decision and the metadata derived from it — face match, document validity,
// over-18, last four of the ID. Images live in a private bucket for at most
// 24 hours and are cleared the moment a decision is recorded
// (supabase/verification.sql). Reviewing decisions rather than documents is
// what keeps the 24-hour destruction promise true.

import { useCallback, useEffect, useState } from "react";
import { supabase, timeAgo } from "@/lib/admin";
import { Badge, Btn, Panel, StatCard, Td, Th, TextArea } from "@/components/ui";

type Status = "pending" | "approved" | "rejected" | "expired" | "revoked";

interface Row {
  id: string;
  user_id: string;
  status: Status;
  method: string;
  vendor: string | null;
  vendor_passed: boolean | null;
  face_match: boolean | null;
  doc_valid: boolean | null;
  over_18: boolean | null;
  id_last4: string | null;
  id_state: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reason: string | null;
  profile?: { name: string; handle: string } | null;
}

const TONE: Record<Status, "ok" | "warn" | "bad" | "muted"> = {
  pending: "warn", approved: "ok", rejected: "bad", expired: "muted", revoked: "bad",
};

export default function Verifications({ admin }: { admin: { id: string } }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Status | "all">("pending");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("identity_verifications")
      .select("id,user_id,status,method,vendor,vendor_passed,face_match,doc_valid,over_18,id_last4,id_state,submitted_at,reviewed_at,reason")
      .order("submitted_at", { ascending: false })
      .limit(500);
    const list = (data || []) as Row[];

    // Attach display names in one query rather than N.
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,name,handle").in("id", ids);
      const byId = new Map((profs || []).map((p: any) => [p.id, p]));
      list.forEach((r) => { r.profile = byId.get(r.user_id) || null; });
    }
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(row: Row, approve: boolean) {
    const why = (reason[row.id] || "").trim();
    if (!approve && !why) {
      alert("A rejection needs a reason — the user is shown it, and it's what lets them fix the problem and retry.");
      return;
    }
    setBusy(row.id);
    const { error } = await supabase.rpc("decide_verification", {
      p_id: row.id, p_approve: approve, p_reviewer: admin.id, p_reason: why || null,
    });
    setBusy(null);
    if (error) { alert(`Could not record the decision: ${error.message}`); return; }
    setReason((r) => ({ ...r, [row.id]: "" }));
    load();
  }

  const pending = rows.filter((r) => r.status === "pending");
  const shown = tab === "all" ? rows : rows.filter((r) => r.status === tab);
  const approved = rows.filter((r) => r.status === "approved").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;

  if (loading) return <div className="p-6 text-sm text-neutral-400">Loading verifications…</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Awaiting review" value={pending.length} tone={pending.length ? "warn" : "ok"} />
        <StatCard label="Approved" value={approved} tone="ok" />
        <StatCard label="Rejected" value={rejected} />
        <StatCard
          label="Oldest pending"
          value={pending.length ? timeAgo(pending[pending.length - 1].submitted_at) : "—"}
          sub="images purge at 24h"
          tone={pending.length ? "warn" : "ok"}
        />
      </div>

      <Panel
        title="ID verification queue"
        action={
          <div className="flex gap-1">
            {(["pending", "approved", "rejected", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-2 py-1 text-xs capitalize ${tab === t ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                {t}
              </button>
            ))}
          </div>
        }
      >
        <p className="mb-3 text-xs text-neutral-500">
          Approving grants the verified check and unlocks crime reporting. Documents are never shown here — review the
          vendor&apos;s result. Images are destroyed 24h after submission, or immediately once you decide.
        </p>

        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">Nothing {tab === "all" ? "yet" : `in ${tab}`}.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>User</Th><Th>Checks</Th><Th>ID</Th><Th>Submitted</Th><Th>Status</Th><Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800 align-top">
                  <Td>
                    <div className="font-medium">{r.profile?.name || "Unknown"}</div>
                    <div className="text-xs text-neutral-500">@{r.profile?.handle || "—"}</div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={r.face_match ? "ok" : r.face_match === false ? "bad" : "muted"}>
                        face {r.face_match === null ? "—" : r.face_match ? "match" : "no match"}
                      </Badge>
                      <Badge tone={r.doc_valid ? "ok" : r.doc_valid === false ? "bad" : "muted"}>
                        doc {r.doc_valid === null ? "—" : r.doc_valid ? "valid" : "invalid"}
                      </Badge>
                      <Badge tone={r.over_18 ? "ok" : r.over_18 === false ? "bad" : "muted"}>
                        {r.over_18 === null ? "age —" : r.over_18 ? "18+" : "under 18"}
                      </Badge>
                    </div>
                    {r.vendor && <div className="mt-1 text-xs text-neutral-600">{r.vendor}</div>}
                  </Td>
                  <Td>
                    <span className="text-xs text-neutral-400">
                      {r.id_last4 ? `••••${r.id_last4}` : "—"} {r.id_state || ""}
                    </span>
                  </Td>
                  <Td><span className="text-xs text-neutral-400">{timeAgo(r.submitted_at)}</span></Td>
                  <Td><Badge tone={TONE[r.status]}>{r.status}</Badge>
                    {r.reason && <div className="mt-1 max-w-[200px] text-xs text-neutral-500">{r.reason}</div>}
                  </Td>
                  <Td>
                    {r.status === "pending" ? (
                      <div className="w-56 space-y-2">
                        <TextArea
                          rows={2}
                          placeholder="Reason (required to reject)"
                          value={reason[r.id] || ""}
                          onChange={(e) => setReason((s) => ({ ...s, [r.id]: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <Btn small tone="ok" disabled={busy === r.id} onClick={() => decide(r, true)}>Approve</Btn>
                          <Btn small tone="danger" disabled={busy === r.id} onClick={() => decide(r, false)}>Reject</Btn>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-600">{r.reviewed_at ? timeAgo(r.reviewed_at) : "—"}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
