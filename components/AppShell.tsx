"use client";

import { apiUrl } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import type { Account, Profile } from "@/lib/auth";
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
  // remember the tab in view before the current one, so overlays like
  // Search can send the back button to where the user actually came from
  const prevTab = useRef<Tab>("feed");
  const changeTab = (t: Tab) => { if (t !== tab) prevTab.current = tab; setTab(t); };
  const [searchReturn, setSearchReturn] = useState<Tab>("feed");
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

  useEffect(() => { track("app_open", {}); }, []);
  useEffect(() => { track("tab_view", { tab }); }, [tab]);

  useEffect(() => {
    fetch(apiUrl("/api/crimeai/lookup"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: profile.address, radiusMiles: profile.alerts.radiusMiles, days: 30 }),
    })
      .then((r) => r.json())
      .then((d) => d.stats && setStats(d.stats))
      .catch(() => {});
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
            changeTab("you");
          } else {
            setProfileHandle(handle);
          }
        },
      }}
    >
      <div className="relative flex-1 overflow-hidden">
        {tab === "feed" && <FeedScreen account={acct} onCompose={() => setComposing("post")} onSos={() => setSosOpen(true)} onSearch={() => { setSearchReturn(prevTab.current); setSearchOpen(true); }} refreshKey={refreshKey} />}
        {tab === "map" && <MapScreen profile={profile} refreshKey={refreshKey} onReport={() => setComposing("report")} />}
        {tab === "ask" && <AskScreen name={account.name} profile={profile} stats={stats} />}
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
      <BottomNav active={tab} onChange={changeTab} inboxDot />
      {/* Full-screen overlays (cover the bottom nav too) */}
      {searchOpen && <SearchScreen account={acct} onClose={() => { setSearchOpen(false); setTab(searchReturn); }} />}
      {profileHandle && <UserProfile handle={profileHandle} account={acct} onClose={() => setProfileHandle(null)} />}
      {composing && <ComposeSheet account={acct} startTab={composing} onClose={() => setComposing(null)} onPosted={() => setRefreshKey((k) => k + 1)} onGoLive={() => setLive(true)} />}
      {live && <LiveStream account={acct} onClose={() => setLive(false)} onPosted={() => setRefreshKey((k) => k + 1)} />}
    </ProfileCtx.Provider>
  );
}
