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
import { apiUrl, authHeaders } from "@/lib/api";
import { CATEGORIES } from "@/lib/categories";
import { useLang, useT } from "@/components/LanguageProvider";
import { LANGS } from "@/lib/i18n";
import { authenticate, biometryStatus, biometryLabel, type BiometryKind } from "@/lib/biometric/client";
import { appLockEnabled, setAppLockEnabled } from "@/lib/biometric/lock";
import { useVerification } from "@/lib/identity/verify-client";
import VerifyPrompt from "@/components/VerifyPrompt";
import { Verified } from "@/components/Icons";

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

  // Read-only entitlement view for RENDERING limits (server is the authority;
  // the DB clamps regardless of what this UI shows). null until loaded /
  // when signed out — in that case nothing is visually gated.
  const [ent, setEnt] = useState<{ plan: string; enforced: boolean; caps: Record<string, any> } | null>(null);
  useEffect(() => {
    authHeaders().then((h) => {
      if (!h.Authorization) return;
      fetch(apiUrl("/api/me/entitlements"), { headers: h })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setEnt(d))
        .catch(() => {});
    });
  }, []);
  const gate = ent?.enforced ? ent : null; // visual gating only when enforcement is on
  const circleLimit: number | null = typeof gate?.caps?.trusted_circle?.value === "number" ? gate.caps.trusted_circle.value : null;
  const allowedChannels: string[] | null = Array.isArray(gate?.caps?.channels?.value) ? gate.caps.channels.value : null;

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
          <ProtectorPanel profile={profile} userId={userId} email={email} onProfile={onProfile} />
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

        {/* ID verification — the way back for anyone who skipped onboarding */}
        <VerificationSection />

        {/* app lock — device-scoped, hidden entirely where biometry can't run */}
        <AppLockSection />

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
          {/* which notifications get pushed to the device */}
          <div className="mt-4 text-xs font-medium uppercase tracking-wide text-ink2">Push me about</div>
          <div className="mt-2 space-y-2">
            {([
              ["report", "Reports near me"],
              ["comment", "Comments on my posts"],
              ["corroboration", "Confirmations of my reports"],
              ["message", "Direct messages"],
              ["follow", "New followers"],
              ["news", "News & announcements"],
              ["like", "Likes"],
            ] as const).map(([key, label]) => {
              const types = profile.pushTypes ?? {};
              const on = types[key] ?? (key !== "like"); // likes default off
              return (
                <Toggle key={key} label={label} on={on}
                  onChange={(v) => {
                    const np = { ...profile, pushTypes: { ...types, [key]: v } };
                    onProfile(np); saveProfile(np).catch(() => {});
                  }} />
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink3">
            Critical incidents near you always come through, even with push off — that&apos;s a safety feature, not a setting.
          </p>

          <div className="mt-4 text-xs font-medium uppercase tracking-wide text-ink2">Notify me via</div>
          <div className="mt-2 space-y-2">
            {([["push", "Push notifications"], ["sms", "Text message (SMS)"], ["email", "Email"]] as const).map(([ch, label]) => {
              const locked = allowedChannels != null && !allowedChannels.includes(ch);
              return (
                <Toggle key={ch} label={label} hint={locked ? "Protector" : undefined} disabled={locked}
                  on={!locked && (profile.alerts.channels as any)[ch]}
                  onChange={(v) => setAlerts({ ...profile.alerts, channels: { ...profile.alerts.channels, [ch]: v } })} />
              );
            })}
          </div>
        </Section>

        {/* trusted circle */}
        <Section title="Trusted circle">
          <p className="mb-2 text-xs text-ink2">
            Alerted when you use SOS or Walk-with-me.
            {circleLimit != null && <span className="text-ink3"> · {Math.min(contacts.filter((c) => c.name.trim()).length, circleLimit)} of {circleLimit}</span>}
          </p>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input value={c.name} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" className="w-1/2 rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
                <input value={c.phone} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder="Phone" inputMode="tel" className="w-1/2 rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
              </div>
            ))}
          </div>
          {circleLimit != null && contacts.length >= circleLimit ? (
            <p className="mt-2 text-xs text-ink3">Circle full — Protectors get a larger trusted circle.</p>
          ) : (
            <button onClick={() => setContacts((cs) => [...cs, { name: "", phone: "" }])} className="mt-2 text-sm text-brand">+ Add contact</button>
          )}
        </Section>

        {/* saved places */}
        <Section title="Saved places">
          <SavedPlaces limitHint={typeof gate?.caps?.saved_locations?.value === "number" ? gate.caps.saved_locations.value : null} />
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
function ProtectorPanel({ profile, userId, email, onProfile }: { profile: Profile; userId: string; email: string; onProfile: (p: Profile) => void }) {
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
  async function openCheckout(priceId?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await supabase!.auth.getSession();
      const jwt = data.session?.access_token;
      if (!jwt) { alert("Please log in again to upgrade."); return; }
      const r = await fetch(apiUrl("/api/pay/authnet/checkout-token"), {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        // whichever interval they picked in the comparison chart; omitted
        // falls back to the existing A/B assignment
        body: JSON.stringify(priceId ? { priceId } : {}),
      });
      const d = await r.json();
      // Send them to the PRICING page rather than straight into checkout:
      // choosing the plan and the interval belongs in the browser, next to
      // the price. "_blank" is what Capacitor hands to the DEVICE'S browser
      // instead of an in-app webview — required for an external purchase, and
      // it's where a customer can actually see the domain and the padlock.
      if (r.ok && d.token) {
        const payBase = process.env.NEXT_PUBLIC_PAY_BASE || "https://pay.publicsafetycrimecenter.com";
        const current = profile.plan === "pro" ? "pro" : "free";
        window.open(`${payBase}/crimeai/pricing?t=${encodeURIComponent(d.token)}&current=${current}`, "_blank");
      } else alert(d.error || "Couldn't start checkout. Try again in a moment.");
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
          <p className="mt-0.5 text-xs text-ink2">Your red shield shows beside your name on your profile. Thank you for keeping the block safe.</p>
          <div className="mt-3">
            <Toggle
              label="Show my Protector badge"
              on={profile.showProBadge !== false}
              onChange={(v) => { const np = { ...profile, showProBadge: v }; onProfile(np); saveProfile(np).catch(() => {}); }}
            />
            <p className="mt-1.5 text-[11px] text-ink3">Off hides the shield from your profile (for you and visitors). Your plan and benefits are unchanged.</p>
          </div>
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

  // Settings makes the PITCH; the pricing page makes the comparison. Keeping
  // the full chart in both places meant two plan pickers to maintain and two
  // places for prices to drift out of step.
  return (
    <div>
      <div className="flex items-center gap-2">
        <ProBadge size={18} />
        <span className="text-sm font-semibold">Become a Protector{price ? ` — from ${price}/mo` : ""}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink2">
        A wider alert radius, full incident history, a deeper Safety Score breakdown and the red shield beside your
        name. Billed monthly, or yearly for less. Cancel any time.
      </p>
      <button
        onClick={() => openCheckout()}
        disabled={busy}
        className="mt-3 block w-full rounded-xl bg-brand py-3 text-center text-sm font-bold text-white active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? "Opening…" : "Compare plans →"}
      </button>
      <p className="mt-2 text-[11px] text-ink3">
        Opens publicsafetycrimecenter.com in your browser, where you can compare plans and subscribe securely.
      </p>
    </div>
  );
}

// Saved places (home, work, school…) — backed by /api/locations, where the
// plan's limit is enforced atomically server-side. UI shows the limit only.
function SavedPlaces({ limitHint }: { limitHint: number | null }) {
  const [locs, setLocs] = useState<{ id: string; label: string; address: string }[]>([]);
  const [limit, setLimit] = useState<number | null>(limitHint);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const h = await authHeaders();
    if (!h.Authorization) return;
    const r = await fetch(apiUrl("/api/locations"), { headers: h }).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    setLocs(d.locations || []);
    if (d.limit != null) setLimit(d.limit);
  }
  useEffect(() => { refresh(); }, []);

  async function add() {
    if (!address.trim() || busy) return;
    setBusy(true); setMsg("");
    try {
      const h = await authHeaders();
      const r = await fetch(apiUrl("/api/locations"), {
        method: "POST", headers: { "Content-Type": "application/json", ...h },
        body: JSON.stringify({ label: label.trim(), address: address.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg(d.upgrade ? "Saved-places limit reached — Protectors get more." : d.error || "Couldn't save."); return; }
      setLabel(""); setAddress("");
      await refresh();
    } catch { setMsg("Couldn't save. Try again."); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    const h = await authHeaders();
    await fetch(apiUrl(`/api/locations?id=${encodeURIComponent(id)}`), { method: "DELETE", headers: h }).catch(() => {});
    setLocs((l) => l.filter((x) => x.id !== id));
  }

  const atLimit = limit != null && locs.length >= limit;
  return (
    <div>
      <p className="mb-2 text-xs text-ink2">
        Quick-check safety around the places you care about.
        {limit != null && <span className="text-ink3"> · {locs.length} of {limit}</span>}
      </p>
      {locs.length > 0 && (
        <div className="mb-2 space-y-2">
          {locs.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-xl border border-ink/10 bg-shell px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{l.label ? `${l.label} — ` : ""}{l.address}</span>
              <button onClick={() => remove(l.id)} className="ml-2 text-xs font-semibold text-ink3">Remove</button>
            </div>
          ))}
        </div>
      )}
      {atLimit ? (
        <p className="text-xs text-ink3">Limit reached — Protectors can save more places.</p>
      ) : (
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (Home)" className="w-1/3 rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address or neighborhood" className="flex-1 rounded-xl border border-ink/10 bg-shell px-3 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
          <button onClick={add} disabled={busy || !address.trim()} className="rounded-xl bg-brand px-3 text-sm font-semibold text-white disabled:opacity-50">Add</button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-ink3">{msg}</p>}
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

// ID verification. Skipping it in onboarding is a real option, so this is the
// way back — and the only place that explains what verification actually buys
// you (reporting) versus what it doesn't (everything else already works).
function VerificationSection() {
  const idv = useVerification();
  const [open, setOpen] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  if (idv.loading) return null;
  const status = justSubmitted ? "pending" : idv.status;

  return (
    <Section title="ID verification">
      {idv.verified ? (
        <div className="flex items-center gap-2 rounded-xl border border-brand/25 bg-brand/5 px-3 py-3">
          <span className="text-brand"><Verified size={18} /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">You&apos;re verified</p>
            <p className="text-xs text-ink3">The red check shows on your profile, and you can file crime reports.</p>
          </div>
        </div>
      ) : status === "pending" ? (
        <div className="rounded-xl border border-ink/10 bg-shell px-3 py-3">
          <p className="text-sm font-semibold text-ink">In review</p>
          <p className="mt-0.5 text-xs text-ink3">We&apos;re checking your ID. You&apos;ll be able to report as soon as it clears.</p>
        </div>
      ) : (
        <>
          <button
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-between rounded-xl border border-ink/10 bg-shell px-3 py-3 active:scale-[0.99]"
          >
            <span className="text-left">
              <span className="block text-sm font-semibold text-ink">
                {status === "rejected" ? "Try verification again" : "Verify your ID"}
              </span>
              <span className="block text-xs text-ink3">Required to file crime reports</span>
            </span>
            <Chevron size={16} />
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-ink3">
            Optional. You can post, comment, follow and use every safety feature without it — only crime reporting needs
            a verified ID. Your ID photo and face scan are deleted within 24 hours; we keep only the result.
          </p>
        </>
      )}
      {open && (
        <VerifyPrompt
          status={idv.status}
          reason={idv.reason}
          onClose={() => setOpen(false)}
          onSubmitted={() => setJustSubmitted(true)}
        />
      )}
    </Section>
  );
}

// Biometric app lock. Renders nothing at all where biometry is unavailable —
// on web, on a handset with nothing enrolled, or before the native build has
// the plugin — so nobody is offered a switch that cannot do anything.
//
// Turning it ON verifies first. Offering a lock and only discovering at the
// next launch that Face ID doesn't work would lock the user out of their own
// safety app; the prompt here proves it works before we ever rely on it.
function AppLockSection() {
  const [status, setStatus] = useState<{ available: boolean; kind: BiometryKind } | null>(null);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    biometryStatus().then((s) => setStatus({ available: s.available, kind: s.kind }));
    setOn(appLockEnabled());
  }, []);

  if (!status?.available) return null;
  const label = biometryLabel(status.kind);

  async function toggle(next: boolean) {
    setErr(null);
    if (!next) { setAppLockEnabled(false); setOn(false); return; }
    const r = await authenticate(`Turn on ${label} lock`);
    if (!r.ok) {
      if (!r.cancelled) setErr(`Couldn't turn on ${label} lock — ${r.reason || "verification failed"}`);
      return;
    }
    setAppLockEnabled(true);
    setOn(true);
  }

  return (
    <Section title="App lock">
      <Toggle label={`Require ${label}`} on={on} onChange={toggle} />
      {err && <p className="mt-2 text-[11px] text-danger">{err}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-ink3">
        Locks CrimeAI behind {label} on this device. <strong className="text-ink2">SOS still works from the lock
        screen</strong> — an emergency never waits for a fingerprint. Your {label} data never leaves your phone
        and is never sent to us.
      </p>
    </Section>
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
function Toggle({ label, on, onChange, disabled, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <button onClick={() => !disabled && onChange(!on)} disabled={disabled}
      className={`flex w-full items-center justify-between rounded-xl border border-ink/10 bg-shell px-3 py-2.5 ${disabled ? "opacity-60" : ""}`}>
      <span className="flex items-center gap-2 text-sm text-ink">
        {label}
        {hint && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">{hint}</span>}
      </span>
      <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-brand" : "bg-ink/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
