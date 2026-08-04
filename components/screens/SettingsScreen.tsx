"use client";

import { useState } from "react";
import { logout, saveProfile, type AlertPrefs, type Profile, type TrustedContact } from "@/lib/auth";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { sendFeedback } from "@/lib/analytics";
import { deleteMyAccount, getBlockedHandles, unblockUser } from "@/lib/moderation";
import { useEffect } from "react";
import Avatar from "@/components/Avatar";
import { TrustPanel } from "@/components/CoverageMatrix";
import { Alert, Car, Eye, Chevron, Logout, Pin, Sun, Moon, ProBadge, Home as HomeIcon, Lock, IdCard, Laptop, Report } from "@/components/Icons";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import { accountHandle } from "@/lib/auth";
import { apiUrl } from "@/lib/api";
import { CATEGORIES } from "@/lib/categories";
import { useLang, useT } from "@/components/LanguageProvider";
import { LANGS } from "@/lib/i18n";

// alert-preference chips render from the shared crime taxonomy
const CAT_ICONS: Record<string, typeof Alert> = {
  domestic: HomeIcon, sexual: Report, violent: Alert, burglary: Lock,
  vehicle: Car, identity: IdCard, cyber: Laptop, other: Eye,
};
const CATS = CATEGORIES.map((c) => ({ id: c.id, label: c.short, color: c.color, Icon: CAT_ICONS[c.id] || Eye }));

export default function SettingsScreen({
  name, email, userId, profile, onProfile, onLogout, onChangeAddress, onClose,
}: {
  name: string; email: string; userId: string; profile: Profile;
  onProfile: (p: Profile) => void; onLogout: () => void; onChangeAddress: () => void; onClose: () => void;
}) {
  const displayName = name;
  const tr = useT();
  const [phone, setPhone] = useState(profile.phone || "");
  const [contacts, setContacts] = useState<TrustedContact[]>(profile.contacts.length ? profile.contacts : [{ name: "", phone: "" }]);
  const [savedMsg, setSavedMsg] = useState("");

  function setAlerts(next: AlertPrefs) {
    const p = { ...profile, alerts: next };
    onProfile(p);
    saveProfile(p).catch(() => {});
  }
  async function saveAccount() {
    const p = { ...profile, phone: phone.trim(), contacts: contacts.filter((c) => c.name.trim() && c.phone.trim()) };
    onProfile(p);
    await saveProfile(p).catch(() => {});
    setSavedMsg("Saved"); setTimeout(() => setSavedMsg(""), 1500);
  }
  const toggleCat = (id: string) =>
    setAlerts({ ...profile.alerts, categories: profile.alerts.categories.includes(id) ? profile.alerts.categories.filter((c) => c !== id) : [...profile.alerts.categories, id] });

  return (
    <div className="absolute inset-0 z-[900] flex flex-col bg-shell fade-in">
      <div className="safe-top flex items-center gap-3 border-b border-ink/10 px-5 pb-3 pt-4">
        <button onClick={onClose} className="-ml-1 text-ink2"><Chevron size={22} style={{ transform: "rotate(180deg)" }} /></button>
        <h1 className="text-lg font-bold">{tr("Settings")}</h1>
        {savedMsg && <span className="ml-auto text-xs text-brand">{savedMsg}</span>}
      </div>

      <div className="scroll-area space-y-5 px-5 pb-24 pt-5">
        {/* account */}
        <Section title="Account">
          <div className="flex items-center gap-3">
            <Avatar photo={profile.photo} name={displayName} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{displayName}</div>
              <div className="text-xs text-ink3">{email}</div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink3">Photo, name, username and bio are edited from your profile → Edit profile.</p>
          <div className="mt-3 text-xs font-medium uppercase tracking-wide text-ink2">Phone</div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+1 (305) 555-0123" className="mt-1 w-full rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
        </Section>

        {/* Protector Plan */}
        <Section title="Protector Plan">
          <ProtectorPanel profile={profile} userId={userId} email={email} />
        </Section>

        {/* emergency SOS */}
        <Section title="Emergency SOS">
          <Toggle
            label="Show SOS button"
            on={profile.sosEnabled !== false}
            onChange={(v) => { const np = { ...profile, sosEnabled: v }; onProfile(np); saveProfile(np).catch(() => {}); }}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-ink3">
            The floating SOS button gives one-tap access to &quot;I&apos;m not safe&quot;, Walk-with-me and Call 911.
            When it&apos;s on, press and drag it to park it anywhere on screen so it never blocks your view.
            Turning it off hides it everywhere, including the Feed header.
          </p>
        </Section>

        {/* privacy */}
        <Section title="Privacy">
          <Toggle
            label="Private account"
            on={!!profile.isPrivate}
            onChange={(v) => { const np = { ...profile, isPrivate: v }; onProfile(np); saveProfile(np).catch(() => {}); }}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-ink3">
            When your account is private, only followers you approve can see your posts, followers and following.
            New followers must send a request — you approve or decline it from your Inbox.
          </p>
        </Section>

        {/* appearance */}
        <Section title="Appearance">
          <ThemePicker />
        </Section>

        {/* language */}
        <Section title="Language">
          <LanguagePicker />
        </Section>

        {/* location */}
        <Section title="Location & radius">
          <button onClick={onChangeAddress} className="flex w-full items-center justify-between rounded-xl border border-ink/10 bg-shell px-3 py-3">
            <span className="flex items-center gap-2 text-sm text-ink"><Pin size={15} /> {[profile.location.neighborhood, profile.location.city, profile.location.state].filter(Boolean).join(", ")}</span>
            <span className="text-sm font-medium text-brand">Change</span>
          </button>
          <div className="mt-3 text-xs font-medium uppercase tracking-wide text-ink2">Alert radius — {profile.alerts.radiusMiles} mi</div>
          <input type="range" min={0.25} max={5} step={0.25} value={profile.alerts.radiusMiles} onChange={(e) => setAlerts({ ...profile.alerts, radiusMiles: parseFloat(e.target.value) })} className="mt-2 w-full accent-brand" />
        </Section>

        {/* alerts */}
        <Section title="Alerts">
          <div className="text-xs font-medium uppercase tracking-wide text-ink2">Alert me about</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATS.map(({ id, label, color, Icon }) => {
              const on = profile.alerts.categories.length === 0 || profile.alerts.categories.includes(id);
              return (
                <button key={id} onClick={() => toggleCat(id)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${on ? "border-ink/20 bg-ink/10 text-ink" : "border-ink/10 text-ink3"}`} style={on ? { color } : {}}>
                  <Icon size={13} />{label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-xs font-medium uppercase tracking-wide text-ink2">Notify me via</div>
          <div className="mt-2 space-y-2">
            <Toggle label="Push notifications" on={profile.alerts.channels.push} onChange={(v) => setAlerts({ ...profile.alerts, channels: { ...profile.alerts.channels, push: v } })} />
            <Toggle label="Text message (SMS)" on={profile.alerts.channels.sms} onChange={(v) => setAlerts({ ...profile.alerts, channels: { ...profile.alerts.channels, sms: v } })} />
            <Toggle label="Email" on={profile.alerts.channels.email} onChange={(v) => setAlerts({ ...profile.alerts, channels: { ...profile.alerts.channels, email: v } })} />
          </div>
        </Section>

        {/* trusted circle */}
        <Section title="Trusted circle">
          <p className="mb-2 text-xs text-ink2">Alerted when you use SOS or Walk-with-me.</p>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input value={c.name} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" className="w-1/2 rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
                <input value={c.phone} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder="Phone" inputMode="tel" className="w-1/2 rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
              </div>
            ))}
          </div>
          <button onClick={() => setContacts((cs) => [...cs, { name: "", phone: "" }])} className="mt-2 text-sm text-brand">+ Add contact</button>
        </Section>

        <button onClick={saveAccount} className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white">Save changes</button>

        <Section title="Send feedback">
          <FeedbackForm author={displayName} />
        </Section>

        <Section title="Privacy & guardrails"><TrustPanel /></Section>

        <Section title="Blocked accounts">
          <BlockedList userId={userId} />
        </Section>

        <button onClick={() => { logout(); onLogout(); }} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-ink/10 bg-card/70 py-3.5 text-sm font-semibold text-red-400 active:scale-[0.99]">
          <Logout size={18} /> Sign out
        </button>

        {/* in-app account deletion — required by Apple & Google for any
            app with account creation */}
        <Section title="Danger zone">
          <DeleteAccount onDeleted={onLogout} />
        </Section>
        <p className="pb-2 text-center text-[11px] text-ink3">CrimeAI · PSCC · BlackSeed Labs / TORR AI · Miami beta · v0.3</p>
      </div>
    </div>
  );
}

// Free → Protector upgrade. Checkout runs on the WEB (pay.publicsafety
// crimecenter.com) — deliberately outside Apple/Google in-app purchases.
function ProtectorPanel({ profile, userId, email }: { profile: Profile; userId: string; email: string }) {
  const [features, setFeatures] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const isPro = profile.plan === "pro";

  useEffect(() => {
    if (!supabaseEnabled) return;
    // Live price from the tier system (the same table checkout charges from);
    // benefit bullets remain display copy on the legacy plans table.
    supabase!.from("tier_prices").select("amount_cents").eq("plan_id", "pro").eq("active", true).order("amount_cents").then(({ data }) => {
      if (data?.length) setPrice(`${data.length > 1 ? "from " : ""}$${(data[0].amount_cents / 100).toFixed(2)}`);
    });
    supabase!.from("plans").select("features").eq("id", "pro").maybeSingle().then(({ data }) => {
      if (data) setFeatures(Array.isArray(data.features) ? data.features : []);
    });
  }, []);

  // Signed checkout handoff: the server mints a short-lived token (checked
  // against the logged-in session) and returns the checkout URL. Nothing
  // identifying goes in a URL we build client-side.
  async function openCheckout() {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await supabase!.auth.getSession();
      const jwt = data.session?.access_token;
      if (!jwt) { alert("Please log in again to upgrade."); return; }
      const r = await fetch(apiUrl("/api/pay/authnet/checkout-token"), {
        method: "POST", headers: { Authorization: `Bearer ${jwt}` },
      });
      const d = await r.json();
      if (r.ok && d.checkoutUrl) window.open(d.checkoutUrl, "_blank");
      else alert(d.error || "Couldn't start checkout. Try again in a moment.");
    } catch {
      alert("Couldn't start checkout. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  if (isPro) {
    return (
      <div className="flex items-start gap-3">
        <ProBadge size={22} />
        <div className="flex-1">
          <p className="text-sm font-semibold">You&apos;re a Protector</p>
          <p className="mt-0.5 text-xs text-ink2">Your red badge is live on your profile and every post. Thank you for keeping the block safe.</p>
          <button
            onClick={async () => {
              try {
                const r = await fetch(apiUrl("/api/pay/portal"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
                const d = await r.json();
                if (r.ok && d.url) window.open(d.url, "_blank");
                else alert(d.error || "Contact support to manage your subscription.");
              } catch { alert("Contact support to manage your subscription."); }
            }}
            className="mt-2 text-xs font-medium text-brand"
          >
            Manage subscription
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <ProBadge size={18} />
        <span className="text-sm font-semibold">Become a Protector{price ? ` — ${price}/mo` : ""}</span>
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {(features.length ? features : ["Red Protector badge on your profile and posts", "Priority visibility for your reports", "Extended alert radius"]).map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-ink2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{f}
          </li>
        ))}
      </ul>
      <button onClick={openCheckout} disabled={busy} className="mt-3 block w-full rounded-xl bg-brand py-3 text-center text-sm font-bold text-white active:scale-[0.99] disabled:opacity-60">
        {busy ? "Opening secure checkout…" : "Upgrade to Protector →"}
      </button>
      <p className="mt-2 text-[11px] text-ink3">Secure checkout on publicsafetycrimecenter.com. Cancel anytime.</p>
    </div>
  );
}

function BlockedList({ userId }: { userId: string }) {
  const [blocked, setBlocked] = useState<string[]>([]);
  useEffect(() => { getBlockedHandles(userId).then((s) => setBlocked([...Array.from(s)].sort())).catch(() => {}); }, [userId]);
  if (!blocked.length) return <p className="text-xs text-ink3">You haven&apos;t blocked anyone. Block users from the ⋮ menu on their posts.</p>;
  return (
    <div className="space-y-2">
      {blocked.map((h) => (
        <div key={h} className="flex items-center justify-between text-sm">
          <span className="text-ink">@{h}</span>
          <button onClick={() => { unblockUser(userId, h).then(() => setBlocked((b) => b.filter((x) => x !== h))); }} className="rounded-lg border border-ink/15 px-3 py-1 text-xs font-semibold text-ink2">Unblock</button>
        </div>
      ))}
    </div>
  );
}

function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function doDelete() {
    setBusy(true); setError("");
    try {
      await deleteMyAccount();
      onDeleted();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  if (!confirming) {
    return (
      <>
        <p className="mb-2 text-xs leading-relaxed text-ink3">Permanently delete your CrimeAI account — your profile, posts, reports, comments, likes, follows and messages are erased. This cannot be undone.</p>
        <button onClick={() => setConfirming(true)} className="w-full rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-semibold text-red-400 active:scale-[0.99]">Delete account</button>
      </>
    );
  }
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold text-red-400">Type DELETE to confirm — this is permanent.</p>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" autoCapitalize="characters" className="w-full rounded-xl border border-red-500/30 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => { setConfirming(false); setText(""); }} className="flex-1 rounded-xl border border-ink/15 py-2.5 text-sm font-medium text-ink2">Cancel</button>
        <button onClick={doDelete} disabled={text !== "DELETE" || busy} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy ? "Deleting…" : "Delete forever"}</button>
      </div>
    </div>
  );
}

function FeedbackForm({ author }: { author: string }) {
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  async function submit() {
    if (!message.trim()) return;
    setState("busy");
    try {
      await sendFeedback(category, message.trim(), author);
      setMessage(""); setState("sent");
      setTimeout(() => setState("idle"), 2500);
    } catch { setState("error"); }
  }
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        {[["general", "General"], ["bug", "Bug"], ["idea", "Idea"], ["safety", "Safety concern"]].map(([id, label]) => (
          <button key={id} onClick={() => setCategory(id)} className={`rounded-full border px-3 py-1.5 text-xs ${category === id ? "border-brand/50 bg-brand/10 text-brand" : "border-ink/10 text-ink2"}`}>{label}</button>
        ))}
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Tell us what's working, what's broken, or what you wish CrimeAI did…" className="w-full resize-none rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
      <button onClick={submit} disabled={state === "busy" || !message.trim()} className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {state === "busy" ? "Sending…" : state === "sent" ? "Sent — thank you!" : "Send to the CrimeAI team"}
      </button>
      {state === "error" && <p className="text-xs text-red-400">Couldn&apos;t send right now. Try again in a moment.</p>}
    </div>
  );
}

function ThemePicker() {
  const [theme, setLocal] = useState<Theme>(getTheme());
  const pick = (t: Theme) => {
    setTheme(t);
    setLocal(t);
  };
  const opts: { id: Theme; label: string; sub: string; Icon: typeof Sun }[] = [
    { id: "dark", label: "Dark", sub: "Futuristic black", Icon: Moon },
    { id: "light", label: "Light", sub: "Clean white", Icon: Sun },
  ];
  return (
    <div className="flex gap-2">
      {opts.map(({ id, label, sub, Icon }) => {
        const on = theme === id;
        return (
          <button key={id} onClick={() => pick(id)} className={`flex flex-1 items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${on ? "border-brand/60 bg-brand/10" : "border-ink/10 bg-shell"}`}>
            <span className={`grid h-9 w-9 place-items-center rounded-full ${on ? "bg-brand text-white" : "bg-ink/10 text-ink2"}`}><Icon size={17} /></span>
            <span>
              <span className={`block text-sm font-semibold ${on ? "text-brand" : "text-ink"}`}>{label}</span>
              <span className="block text-[11px] text-ink3">{sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LanguagePicker() {
  const { lang, setLang, t } = useLang();
  return (
    <div>
      <div className="relative">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as (typeof LANGS)[number]["code"])}
          className="w-full appearance-none rounded-xl border border-ink/10 bg-shell px-3.5 py-3 pr-10 text-sm font-semibold text-ink outline-none focus:border-brand/60"
          aria-label={t("App language")}
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}{l.code !== "en" ? ` · ${l.english}` : ""}
            </option>
          ))}
        </select>
        {/* chevron */}
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink3">{t("Choose the language for the whole app. It follows your device by default.")}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const tr = useT();
  return (
    <div>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink2">{tr(title)}</h2>
      <div className="rounded-2xl border border-ink/10 bg-card/70 p-4">{children}</div>
    </div>
  );
}
function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between rounded-xl border border-ink/10 bg-shell px-3 py-2.5">
      <span className="text-sm text-ink">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-brand" : "bg-ink/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
