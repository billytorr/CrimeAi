"use client";

// Feedback inbox, bug/issue tracker, and app announcements — the
// day-to-day operations pages.
import { useEffect, useState } from "react";
import { supabase, audit, timeAgo, type Admin } from "@/lib/admin";
import { Badge, Btn, Input, Panel, Select, Td, Th, TextArea } from "@/components/ui";

// ── Feedback ────────────────────────────────────────────────────────
export function Feedback({ admin }: { admin: Admin }) {
  const [rows, setRows] = useState<any[]>([]);
  async function load() {
    const { data } = await supabase.from("feedback").select("*").order("created_at", { ascending: false }).limit(300);
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);
  async function setStatus(f: any, status: string) {
    await supabase.from("feedback").update({ status }).eq("id", f.id);
    await audit(admin, `feedback_${status}`, f.author || f.id, {});
    load();
  }
  const tone = (s: string) => (s === "new" ? "warn" : s === "reviewing" ? "blue" : "ok") as "warn" | "blue" | "ok";
  return (
    <Panel title={`User feedback (${rows.length})`}>
      {!rows.length && <p className="py-10 text-center text-sm text-ink3">No feedback yet. Users submit it from the app: You → Settings → Send feedback.</p>}
      <div className="space-y-3">
        {rows.map((f) => (
          <div key={f.id} className="rounded-xl border border-line bg-card2 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-ink2">
                <Badge tone={tone(f.status)}>{f.status}</Badge>
                <Badge>{f.category}</Badge>
                <span className="font-medium">{f.author || "Anonymous"}</span>
                <span className="text-ink3">· {timeAgo(f.created_at)}</span>
              </div>
              <div className="flex gap-1.5">
                {f.status !== "reviewing" && <Btn small onClick={() => setStatus(f, "reviewing")}>Reviewing</Btn>}
                {f.status !== "closed" && <Btn small tone="ok" onClick={() => setStatus(f, "closed")}>Close</Btn>}
              </div>
            </div>
            <p className="mt-2 text-sm">{f.message}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Issues (bug tracker) ────────────────────────────────────────────
export function Issues({ admin }: { admin: Admin }) {
  const [rows, setRows] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [area, setArea] = useState("app");
  const [severity, setSeverity] = useState("medium");

  async function load() {
    const { data } = await supabase.from("issues").select("*").order("created_at", { ascending: false }).limit(300);
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!title.trim()) return;
    await supabase.from("issues").insert({ title: title.trim(), description: desc.trim(), area, severity, reporter: admin.email });
    await audit(admin, "create_issue", title.trim(), { severity, area });
    setTitle(""); setDesc("");
    load();
  }
  async function setStatus(i: any, status: string) {
    await supabase.from("issues").update({ status, updated_at: new Date().toISOString(), assignee: admin.email }).eq("id", i.id);
    await audit(admin, `issue_${status}`, i.title, {});
    load();
  }
  const sevTone = (s: string) => (s === "critical" ? "bad" : s === "high" ? "warn" : s === "medium" ? "blue" : "muted") as any;
  const stTone = (s: string) => (s === "open" ? "warn" : s === "in_progress" ? "blue" : "ok") as any;

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Panel title="Report an issue">
        <div className="space-y-2.5">
          <Input placeholder="Title — e.g. Map pins slow on Android" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextArea rows={4} placeholder="What happened, steps to reproduce, device…" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="flex gap-2">
            <Select value={area} onChange={(e) => setArea(e.target.value)}>
              {["app", "backend", "map", "feed", "auth", "live", "other"].map((a) => <option key={a}>{a}</option>)}
            </Select>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {["low", "medium", "high", "critical"].map((s) => <option key={s}>{s}</option>)}
            </Select>
            <Btn tone="brand" onClick={create}>File issue</Btn>
          </div>
        </div>
      </Panel>
      <Panel title={`Issues (${rows.filter((r) => r.status !== "resolved").length} open / ${rows.length} total)`}>
        <div className="max-h-[62vh] space-y-2.5 overflow-auto">
          {rows.map((i) => (
            <div key={i.id} className="rounded-xl border border-line bg-card2 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={sevTone(i.severity)}>{i.severity}</Badge>
                  <Badge tone={stTone(i.status)}>{i.status.replace("_", " ")}</Badge>
                  <Badge>{i.area}</Badge>
                  <span className="text-sm font-semibold">{i.title}</span>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {i.status === "open" && <Btn small onClick={() => setStatus(i, "in_progress")}>Start</Btn>}
                  {i.status !== "resolved" && <Btn small tone="ok" onClick={() => setStatus(i, "resolved")}>Resolve</Btn>}
                  {i.status === "resolved" && <Btn small onClick={() => setStatus(i, "open")}>Reopen</Btn>}
                </div>
              </div>
              {i.description && <p className="mt-1.5 text-sm text-ink2">{i.description}</p>}
              <p className="mt-1.5 text-[11px] text-ink3">by {i.reporter || "—"} · {timeAgo(i.created_at)}{i.assignee ? ` · assignee ${i.assignee}` : ""}</p>
            </div>
          ))}
          {!rows.length && <p className="py-10 text-center text-sm text-ink3">No issues filed.</p>}
        </div>
      </Panel>
    </div>
  );
}

// ── Announcements / updates ─────────────────────────────────────────
export function Updates({ admin }: { admin: Admin }) {
  const [rows, setRows] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");

  async function load() {
    const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(100);
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function save(publish: boolean) {
    if (!title.trim() || !body.trim()) return;
    await supabase.from("announcements").insert({
      title: title.trim(), body: body.trim(), audience, created_by: admin.email,
      status: publish ? "published" : "draft", published_at: publish ? new Date().toISOString() : null,
    });
    await audit(admin, publish ? "publish_announcement" : "draft_announcement", title.trim(), { audience });
    setTitle(""); setBody("");
    load();
  }
  async function togglePublish(a: any) {
    const publish = a.status !== "published";
    await supabase.from("announcements").update({ status: publish ? "published" : "draft", published_at: publish ? new Date().toISOString() : null }).eq("id", a.id);
    await audit(admin, publish ? "publish_announcement" : "unpublish_announcement", a.title, {});
    load();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <Panel title="New update">
        <div className="space-y-2.5">
          <Input placeholder="Title — e.g. New: live streaming for neighbors" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextArea rows={5} placeholder="What's new / what users should know…" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex items-center gap-2">
            <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="all">All users</option><option value="miami">Miami</option><option value="beta">Beta testers</option>
            </Select>
            <Btn onClick={() => save(false)}>Save draft</Btn>
            <Btn tone="brand" onClick={() => save(true)}>Publish to app</Btn>
          </div>
          <p className="text-[11px] text-ink3">Published updates appear instantly in every user&apos;s Inbox → Activity feed.</p>
        </div>
      </Panel>
      <Panel title={`Updates (${rows.length})`}>
        <div className="max-h-[62vh] space-y-2.5 overflow-auto">
          {rows.map((a) => (
            <div key={a.id} className="rounded-xl border border-line bg-card2 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={a.status === "published" ? "ok" : "muted"}>{a.status}</Badge>
                  <Badge>{a.audience}</Badge>
                  <span className="text-sm font-semibold">{a.title}</span>
                </div>
                <Btn small onClick={() => togglePublish(a)}>{a.status === "published" ? "Unpublish" : "Publish"}</Btn>
              </div>
              <p className="mt-1.5 text-sm text-ink2">{a.body}</p>
              <p className="mt-1.5 text-[11px] text-ink3">by {a.created_by} · {timeAgo(a.created_at)}</p>
            </div>
          ))}
          {!rows.length && <p className="py-10 text-center text-sm text-ink3">Nothing published yet.</p>}
        </div>
      </Panel>
    </div>
  );
}

// ── Live Media Brand Ambassadors ────────────────────────────────────
// LIVE streaming applications from the app. Approving flips the user's
// profiles.live_enabled — their LIVE button activates instantly.
export function Ambassadors({ admin }: { admin: Admin }) {
  const [apps, setApps] = useState<any[]>([]);
  const [enabled, setEnabled] = useState<any[]>([]);
  const [busy, setBusy] = useState("");

  async function load() {
    const [a, e] = await Promise.all([
      supabase.from("live_applications").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id, name, email, handle").eq("live_enabled", true),
    ]);
    setApps(a.data || []); setEnabled(e.data || []);
  }
  useEffect(() => { load(); }, []);

  async function decide(app: any, approve: boolean) {
    setBusy(app.id);
    await supabase.from("live_applications").update({
      status: approve ? "approved" : "declined", decided_by: admin.email, decided_at: new Date().toISOString(),
    }).eq("id", app.id);
    await supabase.from("profiles").update({ live_enabled: approve }).eq("id", app.user_id);
    await audit(admin, approve ? "approve_live_ambassador" : "decline_live_ambassador", app.email, { handle: app.handle });
    await load();
    setBusy("");
  }

  async function revoke(u: any) {
    if (!window.confirm(`Revoke LIVE access for ${u.name}?`)) return;
    await supabase.from("profiles").update({ live_enabled: false }).eq("id", u.id);
    await supabase.from("live_applications").update({ status: "declined", decided_by: admin.email, decided_at: new Date().toISOString() }).eq("user_id", u.id);
    await audit(admin, "revoke_live_ambassador", u.email, {});
    load();
  }

  const tone = (s: string) => (s === "pending" ? "warn" : s === "approved" ? "ok" : "bad") as any;
  const pending = apps.filter((a) => a.status === "pending");

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Panel title={`Applications (${pending.length} pending / ${apps.length} total)`}>
        {!apps.length && <p className="py-10 text-center text-sm text-ink3">No applications yet. Users apply from the app: + → LIVE → Apply to join.</p>}
        <div className="max-h-[68vh] space-y-3 overflow-auto">
          {apps.map((a) => (
            <div key={a.id} className="rounded-xl border border-line bg-card2 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone(a.status)}>{a.status}</Badge>
                  <span className="text-sm font-semibold">{a.name}</span>
                  <span className="text-xs text-ink3">@{a.handle} · {a.email}{a.phone ? ` · ${a.phone}` : ""}</span>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {a.status !== "approved" && <Btn small tone="ok" onClick={() => decide(a, true)} disabled={busy === a.id}>Approve — enable LIVE</Btn>}
                  {a.status === "pending" && <Btn small tone="danger" onClick={() => decide(a, false)} disabled={busy === a.id}>Decline</Btn>}
                </div>
              </div>
              <div className="mt-2.5 space-y-1.5 text-sm">
                <p><span className="text-xs font-semibold uppercase tracking-wide text-ink3">Why: </span>{a.reason || "—"}</p>
                <p><span className="text-xs font-semibold uppercase tracking-wide text-ink3">Experience: </span>{a.experience || "—"}</p>
                {a.socials && <p><span className="text-xs font-semibold uppercase tracking-wide text-ink3">Links: </span><span className="text-blu">{a.socials}</span></p>}
              </div>
              <p className="mt-2 text-[11px] text-ink3">applied {timeAgo(a.created_at)}{a.decided_by ? ` · decided by ${a.decided_by}` : ""}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`Active ambassadors (${enabled.length})`}>
        {!enabled.length ? <p className="py-6 text-center text-sm text-ink3">Nobody has LIVE access yet.</p> : (
          <div className="space-y-2.5">
            {enabled.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2">
                <div><div className="text-sm font-medium">{u.name}</div><div className="text-xs text-ink3">@{u.handle || "—"} · {u.email}</div></div>
                <Btn small tone="danger" onClick={() => revoke(u)}>Revoke</Btn>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Legal documents (Terms of Service / Privacy Policy) ────────────
// Edit and publish new versions; the app's signup gate always serves the
// latest published version, and every user acceptance is recorded.
export function Legal({ admin }: { admin: Admin }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [kind, setKind] = useState<"terms" | "privacy">("terms");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [acceptCount, setAcceptCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load(k = kind) {
    const [{ data }, { count }] = await Promise.all([
      supabase.from("legal_documents").select("*").order("version", { ascending: false }),
      supabase.from("legal_acceptances").select("*", { count: "exact", head: true }),
    ]);
    setDocs(data || []);
    setAcceptCount(count || 0);
    const latest = (data || []).find((d) => d.kind === k && d.published);
    if (latest) { setTitle(latest.title); setBody(latest.body); }
  }
  useEffect(() => { load(kind); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const latestVersion = (k: string) => Math.max(0, ...docs.filter((d) => d.kind === k).map((d) => d.version));

  async function publish() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true); setMsg("");
    const nextVersion = latestVersion(kind) + 1;
    // retire prior published versions, then publish the new one
    await supabase.from("legal_documents").update({ published: false }).eq("kind", kind).eq("published", true);
    const { error } = await supabase.from("legal_documents").insert({
      kind, version: nextVersion, title: title.trim(), body, published: true, created_by: admin.email,
    });
    if (error) setMsg(error.message);
    else {
      await audit(admin, "publish_legal_document", `${kind} v${nextVersion}`, {});
      setMsg(`Published ${kind} v${nextVersion} — live in the app signup immediately.`);
    }
    await load();
    setBusy(false);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <Panel
        title={`Edit ${kind === "terms" ? "Terms of Service" : "Privacy Policy"} (next: v${latestVersion(kind) + 1})`}
        action={
          <Select value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="terms">Terms of Service</option>
            <option value="privacy">Privacy Policy</option>
          </Select>
        }
      >
        <div className="space-y-2.5">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
          <TextArea rows={22} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs leading-relaxed" />
          {msg && <p className={`text-sm ${msg.startsWith("Published") ? "text-ok" : "text-brand"}`}>{msg}</p>}
          <div className="flex items-center gap-3">
            <Btn tone="brand" onClick={publish} disabled={busy}>{busy ? "Publishing…" : "Publish new version"}</Btn>
            <span className="text-xs text-ink3">Publishing creates a new version — prior versions are kept for the legal record.</span>
          </div>
        </div>
      </Panel>

      <div className="space-y-3">
        <Panel title="Acceptance records">
          <div className="text-3xl font-bold">{acceptCount.toLocaleString()}</div>
          <p className="mt-1 text-xs text-ink2">signed acceptances on file (user + document version + timestamp) — your enforceability evidence.</p>
        </Panel>
        <Panel title="Version history">
          <div className="max-h-[46vh] space-y-2 overflow-auto">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span>{d.kind} v{d.version}</span>
                <span className="flex items-center gap-2 text-xs text-ink3">{timeAgo(d.created_at)} {d.published && <Badge tone="ok">live</Badge>}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
