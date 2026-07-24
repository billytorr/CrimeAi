"use client";

import { useEffect, useState } from "react";
import { supabase, timeAgo } from "@/lib/admin";
import { Badge, Panel, Td, Th } from "@/components/ui";

export default function Security() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [banned, setBanned] = useState<any[]>([]);
  const [log, setLog] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [a, b, l] = await Promise.all([
        supabase.from("admins").select("*").order("created_at"),
        supabase.from("profiles").select("name, email, banned_reason, banned_at").eq("banned", true),
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      setAdmins(a.data || []); setBanned(b.data || []); setLog(l.data || []);
    })();
  }, []);

  const CHECKS: { label: string; ok: boolean; note: string }[] = [
    { label: "Row-level security on every table", ok: true, note: "users only read/write what policies allow; admin powers come from the admins allowlist" },
    { label: "Banned users blocked at the database", ok: true, note: "posts INSERT policy rejects banned accounts — not just hidden in the UI" },
    { label: "Admin actions audited", ok: true, note: "every ban, delete, publish is written to audit_log with actor + timestamp" },
    { label: "Portal holds no privileged keys", ok: true, note: "uses the public key + admin session; service_role never leaves the dashboard" },
    { label: "Search engines blocked", ok: true, note: "noindex/nofollow on every portal page" },
    { label: "Custom SMTP (publicsafetycrimecenter.com)", ok: false, note: "pending — connect Resend/Postmark in Supabase → Auth → SMTP" },
    { label: "SMS provider (Twilio)", ok: false, note: "pending — needed for text alerts + phone verification" },
    { label: "Email confirmation on signup", ok: false, note: "currently auto-confirm; enable in Supabase → Auth when SMTP is live" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Security posture">
          <div className="space-y-2.5">
            {CHECKS.map((c) => (
              <div key={c.label} className="flex items-start gap-2.5">
                <Badge tone={c.ok ? "ok" : "warn"}>{c.ok ? "ON" : "TODO"}</Badge>
                <div><div className="text-sm font-medium">{c.label}</div><div className="text-xs text-ink3">{c.note}</div></div>
              </div>
            ))}
          </div>
        </Panel>
        <div className="space-y-3">
          <Panel title={`Command Center admins (${admins.length})`}>
            <div className="space-y-2">
              {admins.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span>{a.email}</span><Badge tone={a.role === "owner" ? "bad" : "blue"}>{a.role}</Badge>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={`Banned users (${banned.length})`}>
            {!banned.length ? <p className="text-sm text-ink3">No banned accounts.</p> : (
              <div className="space-y-2">
                {banned.map((b, i) => (
                  <div key={i} className="text-sm"><span className="font-medium">{b.name}</span> <span className="text-ink3">({b.email})</span><div className="text-xs text-ink3">{b.banned_reason} · {b.banned_at ? timeAgo(b.banned_at) : ""}</div></div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel title={`Audit log (${log.length} recent actions)`}>
        <div className="max-h-[46vh] overflow-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line"><Th>When</Th><Th>Admin</Th><Th>Action</Th><Th>Target</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {log.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap text-ink3">{timeAgo(e.created_at)}</Td>
                  <Td className="text-ink2">{e.admin_email}</Td>
                  <Td><Badge tone={/ban|delete/.test(e.action) ? "bad" : "blue"}>{e.action}</Badge></Td>
                  <Td className="text-ink2">{e.target}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {!log.length && <p className="py-8 text-center text-sm text-ink3">No admin actions recorded yet.</p>}
        </div>
      </Panel>
    </div>
  );
}
