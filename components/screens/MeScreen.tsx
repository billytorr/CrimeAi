"use client";

import { useEffect, useRef, useState } from "react";
import { accountHandle, saveProfile, type Account, type Profile } from "@/lib/auth";
import FollowListSheet from "@/components/FollowList";
import EditProfile from "@/components/EditProfile";
import type { AreaStats } from "@/lib/types";
import { myPosts, savedPosts, repostedPosts, getInteractions, getUserStats, type Post, type Interactions } from "@/lib/social";
import SafetyScore from "@/components/SafetyScore";
import { CategoryBreakdown, TimeOfDay } from "@/components/Breakdown";
import CoverageMatrix from "@/components/CoverageMatrix";
import Avatar from "@/components/Avatar";
import FeedList from "@/components/FeedList";
import ProfileGrid from "@/components/ProfileGrid";
import SettingsScreen from "@/components/screens/SettingsScreen";
import { Settings as SettingsIcon, Grid, Report, Pin, Alert, Camera } from "@/components/Icons";

type Section = "posts" | "safety";

export default function MeScreen({
  account, stats, onProfile, onLogout, onChangeAddress, focusPostId, onFocusConsumed, onName,
}: {
  account: Account; stats: AreaStats | null;
  onProfile: (p: Profile) => void; onLogout: () => void; onChangeAddress: () => void;
  focusPostId?: string | null; onFocusConsumed?: () => void; onName?: (n: string) => void;
}) {
  const profile = account.profile!;
  const [section, setSection] = useState<Section>("posts");
  const [followList, setFollowList] = useState<"followers" | "following" | null>(null);
  const [editing, setEditing] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  // first-photo prompt: users still on the default avatar get an upload
  // badge right on their profile; it disappears once a photo is set
  // (changing it later lives in Settings)
  function pickFirstPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const np = { ...profile, photo: String(r.result) };
      onProfile(np);
      saveProfile(np).catch(() => {});
    };
    r.readAsDataURL(f);
  }
  const [safetyTab, setSafetyTab] = useState<"score" | "reports" | "hood">("score");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mine, setMine] = useState<Post[]>([]);
  const [saved, setSaved] = useState<Post[]>([]);
  const [reposted, setReposted] = useState<Post[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [inter, setInter] = useState<Interactions>({ likes: new Set(), saves: new Set(), follows: new Set(), requested: new Set(), reposts: new Set() });

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [m, s, i, st, rp] = await Promise.all([myPosts(account.id), savedPosts(account.id), getInteractions(account.id), getUserStats(accountHandle(account)), repostedPosts(account.id)]);
      if (!cancel) { setMine(m); setSaved(s); setInter(i); setFollowerCount(st?.followers ?? 0); setReposted(rp); }
    })();
    return () => { cancel = true; };
  }, [account.id, settingsOpen]);

  const followingCount = inter.follows.size;
  const timeline = mine; // full timeline — every content type, reports included
  const myReports = mine.filter((x) => x.kind === "report");

  // a tap on one of your own posts in the feed routes here with its id —
  // everything (reports included) opens from the Posts timeline
  useEffect(() => {
    if (focusPostId) setSection("posts");
  }, [focusPostId]);

  return (
    <div className="flex h-full flex-col">
      <div className="safe-top flex items-center justify-between border-b border-ink/10 bg-shell/95 px-5 pb-3 pt-4 backdrop-blur">
        <h1 className="text-lg font-bold">Profile</h1>
        <button onClick={() => setSettingsOpen(true)} className="text-ink2" aria-label="Settings"><SettingsIcon size={22} /></button>
      </div>

      <div className="scroll-area pb-24">
        {/* profile header */}
        <div className="px-5 pt-5">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <Avatar photo={profile.photo} name={account.name} size={72} />
              {!profile.photo && (
                <button onClick={() => photoRef.current?.click()} aria-label="Add profile photo" className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-shell bg-brand text-white active:scale-95">
                  <Camera size={14} />
                </button>
              )}
              <input ref={photoRef} type="file" accept="image/*" hidden onChange={pickFirstPhoto} />
            </div>
            <div className="flex flex-1 justify-around text-center">
              <button onClick={() => setFollowList("following")}><Stat n={followingCount} label="Following" /></button>
              <button onClick={() => setFollowList("followers")}><Stat n={followerCount} label="Followers" /></button>
              <Stat n={mine.reduce((s, p) => s + p.likes, 0)} label="Likes" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-semibold">{account.name} <span className="text-xs font-normal text-ink3">@{accountHandle(account)}</span></div>
            <div className="flex items-center gap-1 text-xs text-ink2"><Pin size={12} /> {profile.location.neighborhood}, Miami FL {profile.usedGeolocation && <span className="text-brand">· live location</span>}</div>
            {profile.bio && <p className="mt-1.5 text-sm text-ink2">{profile.bio}</p>}
            <button onClick={() => setEditing(true)} className="mt-3 w-full rounded-xl border border-ink/15 bg-card py-2.5 text-sm font-semibold text-ink active:scale-[0.99]">
              Edit profile
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="mt-4 flex border-b border-ink/10">
          <Tab active={section === "posts"} onClick={() => setSection("posts")} Icon={Grid} label="Posts" />
          <Tab active={section === "safety"} onClick={() => setSection("safety")} Icon={Report} label="My Safety" />
        </div>

        {section === "posts" && (
          <ProfileGrid
            posts={timeline}
            saved={saved}
            reposted={reposted}
            account={account}
            interactions={inter}
            emptyText="You haven't posted yet. Tap + on the Feed to share or report something."
            focusPostId={focusPostId}
            onFocusConsumed={onFocusConsumed}
          />
        )}
        {section === "safety" && (
          <div>
            {/* My Safety sub-tabs — mirrors the Posts tab structure */}
            <div className="flex border-b border-ink/10">
              {([["score", "My Score", Report], ["reports", "My Reports", Alert], ["hood", "My Neighborhood", Pin]] as [typeof safetyTab, string, typeof Report][]).map(([id, label, Icon]) => {
                const on = safetyTab === id;
                const n = id === "reports" ? myReports.length : 0;
                return (
                  <button key={id} onClick={() => setSafetyTab(id)}
                    className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${on ? "text-ink" : "text-ink3"}`}>
                    <Icon size={18} />
                    <span>{label}{n > 0 && <span className={on ? "text-brand" : ""}> {n}</span>}</span>
                    {on && <span className="absolute bottom-0 h-0.5 w-12 rounded-full bg-brand" />}
                  </button>
                );
              })}
            </div>

            {safetyTab === "score" && (
              <div className="space-y-4 px-5 py-4">
                {stats
                  ? <SafetyScore stats={stats} neighborhood={profile.location.neighborhood} />
                  : <p className="py-10 text-center text-sm text-ink3">Loading your safety score…</p>}
              </div>
            )}

            {safetyTab === "reports" && (
              myReports.length
                ? <FeedList posts={myReports} account={account} interactions={inter} emptyText="" />
                : <p className="px-8 py-10 text-center text-sm text-ink3">No reports yet. Tap + on the Feed and choose Report to flag a safety risk or criminal activity — it pins to the map and shows here.</p>
            )}

            {safetyTab === "hood" && (
              <div className="space-y-4 px-5 py-4">
                {stats ? (
                  <>
                    <CategoryBreakdown stats={stats} />
                    <TimeOfDay stats={stats} />
                    <CoverageMatrix />
                  </>
                ) : <p className="py-10 text-center text-sm text-ink3">Loading {profile.location.neighborhood} data…</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {followList && <FollowListSheet handle={accountHandle(account)} kind={followList} onClose={() => setFollowList(null)} />}

      {editing && (
        <EditProfile
          account={{ ...account, profile }}
          currentHandle={accountHandle({ ...account, profile })}
          onSaved={(p, newName) => {
            onProfile(p);
            onName?.(newName);
            // refetch posts so renamed authorship shows immediately
            myPosts(account.id).then(setMine).catch(() => {});
          }}
          onClose={() => setEditing(false)}
        />
      )}

      {settingsOpen && (
        <SettingsScreen
          name={account.name}
          email={account.email}
          userId={account.id}
          profile={profile}
          onProfile={onProfile}
          onLogout={onLogout}
          onChangeAddress={onChangeAddress}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return <div><div className="text-lg font-bold">{n}</div><div className="text-xs text-ink2">{label}</div></div>;
}
function Tab({ active, onClick, Icon, label }: { active: boolean; onClick: () => void; Icon: typeof Grid; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-xs font-semibold ${active ? "border-brand text-ink" : "border-transparent text-ink3"}`}>
      <Icon size={16} /> {label}
    </button>
  );
}
