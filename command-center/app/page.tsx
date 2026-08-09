"use client";

import { useEffect, useState } from "react";
import { adminLogin, adminLogout, currentAdmin, canAccess, ROLE_INFO, type Admin, type SectionId } from "@/lib/admin";
import { Btn, Input } from "@/components/ui";
import Overview from "@/components/Overview";
import Users from "@/components/Users";
import Content from "@/components/Content";
import Analytics from "@/components/Analytics";
import { Feedback, Issues, Updates, Ambassadors, Legal } from "@/components/Ops";
import Security from "@/components/Security";
import Settings from "@/components/Settings";
import Finance from "@/components/Finance";
import Sources from "@/components/Sources";
import Scores from "@/components/Scores";
import Verifications from "@/components/Verifications";
import Plans from "@/components/Plans";
import Assistant from "@/components/Assistant";

type Section = SectionId;

const NAV: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "content", label: "Content" },
  { id: "analytics", label: "Analytics" },
  { id: "feedback", label: "Feedback" },
  { id: "issues", label: "Issues" },
  { id: "updates", label: "Updates" },
  { id: "ambassadors", label: "Live Access" },
  { id: "legal", label: "Legal" },
  { id: "finance", label: "Finance" },
  { id: "sources", label: "Sources" },
  { id: "scores", label: "Scores" },
  { id: "verifications", label: "Verifications" },
  { id: "plans", label: "Plans" },
  { id: "assistant", label: "Assistant" },
  { id: "security", label: "Security" },
  { id: "settings", label: "Settings" },
];

export default function CommandCenter() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState<Section>("overview");

  useEffect(() => {
    currentAdmin().then((a) => { setAdmin(a); setChecking(false); });
  }, []);

  const visible = canAccess(admin?.role || "analyst", section) ? section : "overview";

  if (checking) return <Center><p className="text-sm text-ink3">Authenticating…</p></Center>;
  if (!admin) return <Login onAuthed={setAdmin} />;

  return (
    <div className="flex min-h-screen">
      {/* sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-shell">
        <div className="flex items-center gap-2.5 px-5 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="CrimeAI" width={34} height={34} className="rounded-lg" />
          <div>
            <div className="text-sm font-bold leading-tight">Command Center</div>
            <div className="text-[11px] text-ink3">CrimeAI · PSCC</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.filter((n) => canAccess(admin.role, n.id)).map((n) => (
            <button key={n.id} onClick={() => setSection(n.id)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${section === n.id ? "bg-brand/15 text-brand" : "text-ink2 hover:bg-white/5 hover:text-ink"}`}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <div className="text-sm font-medium">{admin.name}</div>
          <div className="mb-2 text-[11px] text-ink3">{admin.email} · {ROLE_INFO[admin.role]?.label || admin.role}</div>
          <Btn small onClick={() => adminLogout().then(() => setAdmin(null))}>Sign out</Btn>
        </div>
      </aside>

      {/* main */}
      <main className="min-w-0 flex-1 bg-[#06070b]">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h1 className="text-lg font-bold capitalize">{section}</h1>
          <span className="text-xs text-ink3">Live · connected to production database</span>
        </header>
        <div className="p-6">
          {visible === "overview" && <Overview />}
          {visible === "users" && <Users admin={admin} />}
          {visible === "content" && <Content admin={admin} />}
          {visible === "analytics" && <Analytics />}
          {visible === "feedback" && <Feedback admin={admin} />}
          {visible === "issues" && <Issues admin={admin} />}
          {visible === "updates" && <Updates admin={admin} />}
          {visible === "ambassadors" && <Ambassadors admin={admin} />}
          {visible === "legal" && <Legal admin={admin} />}
          {visible === "finance" && <Finance admin={admin} />}
          {visible === "sources" && <Sources admin={admin} />}
          {visible === "scores" && <Scores />}
          {visible === "verifications" && <Verifications admin={admin} />}
          {visible === "plans" && <Plans />}
          {visible === "assistant" && <Assistant admin={admin} />}
          {visible === "security" && <Security />}
          {visible === "settings" && <Settings admin={admin} />}
        </div>
      </main>
    </div>
  );
}

function Login({ onAuthed }: { onAuthed: (a: Admin) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true); setError("");
    try { onAuthed(await adminLogin(email, password)); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <Center>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-7">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="CrimeAI" width={52} height={52} className="rounded-xl" />
          <h1 className="mt-4 text-xl font-bold">CrimeAI Command Center</h1>
          <p className="mt-1 text-xs text-ink3">Authorized administrators only. All actions are audited.</p>
        </div>
        <div className="mt-6 space-y-3">
          <Input type="email" placeholder="admin email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          {error && <p className="text-sm text-brand">{error}</p>}
          <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </div>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center p-6">{children}</div>;
}
