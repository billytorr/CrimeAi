"use client";

import { apiUrl, authHeaders } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { getCurrentAccount, type Account, type Profile } from "@/lib/auth";
import type { AreaStats } from "@/lib/types";
import BottomNav, { Tab } from "@/components/BottomNav";
import SosSheets, { SosFab } from "@/components/SOS";
import ComposeSheet from "@/components/ComposeSheet";
import LiveStream from "@/components/LiveStream";
import UserProfile from "@/components/UserProfile";
import { ProfileCtx } from "@/lib/profileContext";
import { accountHandle } from "@/lib/auth";
import { track } from "@/lib/analytics";
import AskScreen from "@/components/screens/AskScreen";
import FeedScreen from "@/components/screens/FeedScreen";
import MapScreen from "@/components/screens/MapScreen";
import InboxScreen from "@/components/screens/InboxScreen";
import MeScreen from "@/components/screens/MeScreen";
import SearchScreen from "@/components/screens/SearchScreen";

export default function AppShell({
  account, onLogout, onChangeAddress,
}: {
  account: Account; onLogout: () => void; onChangeAddress: (current: Profile) => void;
}) {
  const [tab, setTab] = useState<Tab>("feed"); // Feed is the home
  const [profile, setProfile] = useState<Profile>(account.profile!);
  const [name, setName] = useState(account.name); // Edit profile renames propagate app-wide
  const [stats, setStats] = useState<AreaStats | null>(null);
  const [composing, setComposing] = useState<null | "post" | "report">(null);
  const [live, setLive] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileHandle, setProfileHandle] = useState<string | null>(null);
  const [focusPostId, setFocusPostId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [askSeed, setAskSeed] = useState<import("@/components/screens/AskScreen").AskSeed | null>(null);

  useEffect(() => { track("app_open", {}); }, []);
  useEffect(() => { track("tab_view", { tab }); }, [tab]);

  // ── entitlement refresh (App Store remediation Phase 4.2/4.4) ──
  // "confirming": after external checkout the crimeai://checkout-return deep
  // link fires and we poll the server entitlement with backoff for up to 60s
  // (the webhook may still be in flight). If it doesn't land in time we show
  // a manual-refresh state — a paying user is never left at a locked paywall.
  // Foreground: the plan also re-checks on app resume.
  const [confirming, setConfirming] = useState<null | "polling" | "manual">(null);
  const pollGen = useRef(0);

  async function refreshPlan(): Promise<boolean> {
    const acct = await getCurrentAccount().catch(() => null);
    if (acct?.profile && acct.profile.plan !== profile.plan) setProfile(acct.profile);
    return acct?.profile?.plan === "pro";
  }

  async function confirmPayment() {
    const gen = ++pollGen.current;
    setConfirming("polling");
    const started = Date.now();
    let delay = 2000;
    while (pollGen.current === gen && Date.now() - started < 60_000) {
      if (await refreshPlan()) { if (pollGen.current === gen) setConfirming(null); return; }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.5, 8000);
    }
    if (pollGen.current === gen) setConfirming("manual");
  }

  useEffect(() => {
    const onReturn = () => { confirmPayment(); };
    let eventName = "crimeai:checkout-return";
    import("@/lib/native/deepLinks").then((m) => { eventName = m.CHECKOUT_RETURN_EVENT; window.addEventListener(eventName, onReturn); }).catch(() => {});
    let resumeHandle: { remove: () => void } | null = null;
    import("@capacitor/core").then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      import("@capacitor/app").then(({ App }) => {
        App.addListener("resume", () => { refreshPlan(); }).then((h) => { resumeHandle = h; });
      });
    }).catch(() => {});
    return () => {
      pollGen.current++;
      window.removeEventListener(eventName, onReturn);
      resumeHandle?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh this device's push token on launch — WITHOUT prompting. The
  // permission prompt itself is asked once, in onboarding, right after the
  // user sets their alert radius and says they want push (see Onboarding).
  // Here we only re-register devices that already granted it, because APNs
  // and FCM tokens rotate and a stale token silently stops delivering.
  useEffect(() => {
    let cancelled = false;
    import("@/lib/push/client")
      .then(({ registerForPush }) => registerForPush({ promptIfNeeded: false }))
      .then((r) => {
        if (cancelled) return;
        if (r.registered) track("push_registered", {});
        // "not a native build" is the web case and "permission prompt" means
        // onboarding hasn't asked yet — neither is a failure worth recording.
        else if (r.reason && !/not a native build|permission prompt/.test(r.reason)) {
          track("push_register_failed", { reason: r.reason });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    authHeaders().then((h) =>
      fetch(apiUrl("/api/crimeai/lookup"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...h },
        body: JSON.stringify({ address: profile.address, radiusMiles: profile.alerts.radiusMiles, days: 30 }),
      })
        .then((r) => r.json())
        .then((d) => d.stats && setStats(d.stats))
        .catch(() => {})
    );
  }, [profile.address, profile.alerts.radiusMiles]);

  const acct = { ...account, name, profile };

  return (
    <ProfileCtx.Provider
      value={{
        open: (handle, postId) => {
          // your own profile is the You tab — never a separate overlay
          if (handle === accountHandle(acct)) {
            setProfileHandle(null);
            setFocusPostId(postId || null);
            setTab("you");
          } else {
            setProfileHandle(handle);
          }
        },
        askAbout: (post) => {
          // share a post into CrimeAI: seed a thread and jump to the Ask tab
          setAskSeed({ postId: post.id, text: post.text });
          setTab("ask");
        },
      }}
    >
      <div className="relative flex-1 overflow-hidden">
        {tab === "feed" && <FeedScreen account={acct} onCompose={() => setComposing("post")} onSos={() => setSosOpen(true)} onSearch={() => setSearchOpen(true)} refreshKey={refreshKey} />}
        {tab === "map" && <MapScreen profile={profile} refreshKey={refreshKey} onReport={() => setComposing("report")} />}
        {tab === "ask" && <AskScreen account={acct} name={account.name} profile={profile} stats={stats} seed={askSeed} onSeedConsumed={() => setAskSeed(null)} />}
        {tab === "inbox" && <InboxScreen account={acct} refreshKey={refreshKey} />}
        {tab === "you" && (
          <MeScreen
            account={acct}
            stats={stats}
            focusPostId={focusPostId}
            onFocusConsumed={() => setFocusPostId(null)}
            onName={setName}
            onProfile={setProfile}
            onLogout={onLogout}
            onChangeAddress={() => onChangeAddress(profile)}
          />
        )}
        {/* Floating SOS on Map / Ask / Inbox; Feed uses a header pill so it never covers a reel.
            Draggable anywhere; hidden entirely when Settings → Emergency SOS is off. */}
        {profile.sosEnabled !== false && (tab === "map" || tab === "ask" || tab === "inbox") && <SosFab onClick={() => setSosOpen(true)} />}
        <SosSheets open={sosOpen} onClose={() => setSosOpen(false)} profile={profile} />
      </div>
      {/* payment-confirmation state after checkout return */}
      {confirming === "polling" && (
        <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-[1500] mx-auto w-fit rounded-full border border-ink/10 bg-card px-4 py-2 text-xs font-medium text-ink shadow-lg">
          Confirming your payment…
        </div>
      )}
      {confirming === "manual" && (
        <div className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+10px)] z-[1500] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-ink/10 bg-card px-4 py-3 shadow-lg">
          <p className="min-w-0 flex-1 text-xs text-ink2">Still confirming your payment — it can take a minute to land.</p>
          <button onClick={() => confirmPayment()} className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white">Refresh</button>
          <button onClick={() => setConfirming(null)} aria-label="Dismiss" className="shrink-0 text-ink3">✕</button>
        </div>
      )}
      <BottomNav active={tab} onChange={setTab} inboxDot />
      {/* Full-screen overlays (cover the bottom nav too). Search is a plain
          overlay — closing it reveals the exact tab it was opened over, so
          Back always returns to the page the user came from. */}
      {searchOpen && <SearchScreen account={acct} onClose={() => setSearchOpen(false)} />}
      {profileHandle && <UserProfile handle={profileHandle} account={acct} onClose={() => setProfileHandle(null)} />}
      {composing && <ComposeSheet account={acct} startTab={composing} onClose={() => setComposing(null)} onPosted={() => setRefreshKey((k) => k + 1)} onGoLive={() => setLive(true)} />}
      {live && <LiveStream account={acct} onClose={() => setLive(false)} onPosted={() => setRefreshKey((k) => k + 1)} />}
    </ProfileCtx.Provider>
  );
}
