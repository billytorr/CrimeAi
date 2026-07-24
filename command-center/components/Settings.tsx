"use client";

// Portal settings — team management modeled on Facebook's Page-role
// system: invite by email with a role, change roles, remove members.
// Owner is untouchable; only the owner manages admins (enforced by RLS
// too, so the UI rules can't be bypassed).
import { useEffect, useState } from "react";
import {
  inviteMember, listMembers, removeMember, updateMemberRole, timeAgo,
  ROLE_INFO, type Admin, type Member, type Role,
} from "@/lib/admin";
import { Badge, Btn, Input, Panel, Select, Td, Th } from "@/components/ui";

const GRANTABLE: Role[] = ["admin", "moderator", "analyst"];

export default function Settings({ admin }: { admin: Admin }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("moderator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // shown exactly once after an invite creates a brand-new account
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const load = () => listMembers().then(setMembers);
  useEffect(() => { load(); }, []);

  async function invite() {
    setBusy(true); setError(""); setIssued(null);
    try {
      const r = await inviteMember(admin, email, name, role);
      if (r.tempPassword) setIssued({ email: email.trim().toLowerCase(), password: r.tempPassword });
      setEmail(""); setName("");
      await load();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  async function changeRole(m: Member, r: Role) {
    setError("");
    try { await updateMemberRole(admin, m, r); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  async function remove(m: Member) {
    if (!window.confirm(`Remove ${m.name || m.email} from the Command Center? Their app account is not affected.`)) return;
    setError("");
    try { await removeMember(admin, m); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  const roleTone = (r: Role) => (r === "owner" ? "bad" : r === "admin" ? "blue" : r === "moderator" ? "warn" : "muted") as any;
  const iCanManage = (m: Member) => m.role !== "owner" && m.id !== admin.id && (admin.role === "owner" || m.role !== "admin");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Panel title="Add a team member">
            <div className="space-y-2.5">
              <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input type="email" placeholder="work email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full">
                {GRANTABLE.filter((r) => r !== "admin" || admin.role === "owner").map((r) => (
                  <option key={r} value={r}>{ROLE_INFO[r].label}</option>
                ))}
              </Select>
              <p className="text-[11px] leading-relaxed text-ink3">{ROLE_INFO[role].blurb}</p>
              {error && <p className="text-sm text-brand">{error}</p>}
              <Btn tone="brand" onClick={invite} disabled={busy}>{busy ? "Adding…" : "Grant portal access"}</Btn>
              <p className="text-[11px] text-ink3">
                If they already have a CrimeAI account, access is granted to it instantly. Otherwise an account is
                created and you&apos;ll get a one-time temporary password to hand them — they should change it after
                first login. (Branded email invites switch on automatically once publicsafetycrimecenter.com SMTP is connected.)
              </p>
            </div>
          </Panel>

          {issued && (
            <Panel title="One-time credentials — share securely">
              <div className="space-y-1 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm">
                <div><span className="text-ink2">Login:</span> <span className="font-semibold">{issued.email}</span></div>
                <div><span className="text-ink2">Temp password:</span> <span className="font-mono font-semibold tracking-wide">{issued.password}</span></div>
                <p className="pt-1 text-[11px] text-ink3">Shown once — it is not stored anywhere in the portal. Send it over a secure channel.</p>
              </div>
            </Panel>
          )}

          <Panel title="How roles work">
            <div className="space-y-2.5">
              {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
                <div key={r} className="flex items-start gap-2.5">
                  <Badge tone={roleTone(r)}>{ROLE_INFO[r].label}</Badge>
                  <p className="text-xs leading-relaxed text-ink2">{ROLE_INFO[r].blurb}</p>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-ink3">
                Same model Facebook uses for Page teams: task-scoped roles, invited by email, owner protected.
                Every grant, change, and removal lands in the audit log.
              </p>
            </div>
          </Panel>
        </div>

        <Panel title={`Team (${members.length})`}>
          <table className="w-full">
            <thead><tr className="border-b border-line"><Th>Member</Th><Th>Role</Th><Th>Added</Th><Th>Invited by</Th><Th>Manage</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {members.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <div className="font-medium">{m.name || "—"}{m.id === admin.id && <span className="ml-1.5 text-[11px] text-ink3">(you)</span>}</div>
                    <div className="text-xs text-ink3">{m.email}</div>
                  </Td>
                  <Td><Badge tone={roleTone(m.role)}>{ROLE_INFO[m.role]?.label || m.role}</Badge></Td>
                  <Td className="text-ink3">{timeAgo(m.created_at)}</Td>
                  <Td className="text-ink3">{m.invited_by || "founding team"}</Td>
                  <Td>
                    {iCanManage(m) ? (
                      <div className="flex items-center gap-1.5">
                        <Select value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)}>
                          {GRANTABLE.filter((r) => r !== "admin" || admin.role === "owner").map((r) => (
                            <option key={r} value={r}>{ROLE_INFO[r].label}</option>
                          ))}
                        </Select>
                        <Btn small tone="danger" onClick={() => remove(m)}>Remove</Btn>
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink3">{m.role === "owner" ? "protected" : m.id === admin.id ? "—" : "owner only"}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
