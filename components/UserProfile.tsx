"use client";

import { useEffect, useMemo, useState } from "react";
import { accountHandle, type Account } from "@/lib/auth";
import { postsByHandle, getInteractions, toggleFollowState, userByHandle, trendingScore, getUserStats, type Post, type Interactions, type UserStats, type FollowState } from "@/lib/social";
import ProfileGrid from "@/components/ProfileGrid";
import FollowListSheet from "@/components/FollowList";
import MessageThread from "@/components/MessageThread";
import Avatar from "@/components/Avatar";
import { Chevron, Mail, Verified, Pin } from "@/components/Icons";

export default function UserProfile({ handle, account, onClose }: { handle: string; account: Account; onClose: () => void }) {
  const myHandle = accountHandle(account);
  const isMe = handle === myHandle;
  const persona = userByHandle(handle);

  const [posts, setPosts] = useState<Post[]>([]);
  const [inter, setInter] = useState<Interactions>({ likes: new Set(), saves: new Set(), follows: new Set(), requested: new Set(), reposts: new Set() });
  const [followList, setFollowList] = useState<"followers" | "following" | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [followOver, setFollowOver] = useState<FollowState | null>(null);
  const [messaging, setMessaging] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      const [p, i, s] = await Promise.all([postsByHandle(handle, account.id), getInteractions(account.id), getUserStats(handle)]);
      if (cancel) return;
      setPosts(p); setInter(i); setStats(s); setLoading(false);
    })();
    return () => { cancel = true; };
  }, [handle, account.id]);

  // Display identity: persona → current user → derived from their posts.
  const first = posts[0];
  const name = persona?.name || (isMe ? account.name : stats?.name || first?.author || handle);
  const color = persona?.color || first?.color || "#1b7f3a";
  const verified = persona?.verified ?? first?.verified ?? false;
  const neighborhood = persona?.neighborhood || (isMe ? account.profile?.location.neighborhood : first?.neighborhood) || "Miami";
  const bio = persona?.bio || (isMe ? account.profile?.bio || "Your CrimeAI profile — your posts and reports appear here." : stats?.bio || "Neighbor on CrimeAI.");
  const photo = isMe ? account.profile?.photo : stats?.photo || undefined;

  // Instagram follow semantics: public → Following, private → Requested
  // until the owner approves.
  const serverState: FollowState = inter.follows.has(handle) ? "following" : inter.requested.has(handle) ? "requested" : "none";
  const followState: FollowState = (followOver as FollowState | null) ?? serverState;
  const followed = followState === "following";
  const totalLikes = useMemo(() => posts.reduce((s, p) => s + p.likes, 0), [posts]);
  const totalEngagement = useMemo(() => posts.reduce((s, p) => s + trendingScore(p), 0), [posts]);
  // Live counts from the follows table (`stats`). The server count already
  // includes my own follow when it exists, so the optimistic bump only
  // applies the DELTA between what I see and what the server knows.
  const baseFollowers = stats ? stats.followers : (persona?.followers ?? 0);
  const followDelta = (followed ? 1 : 0) - (serverState === "following" ? 1 : 0);
  const followers = Math.max(0, baseFollowers + (isMe ? 0 : followDelta));
  const following = isMe ? inter.follows.size : (stats ? stats.following : persona?.following ?? 0);
  // private accounts hide posts + lists until your request is APPROVED
  const isPrivate = !!stats?.isPrivate;
  const locked = isPrivate && !isMe && serverState !== "following" && followState !== "following";

  function doFollow() {
    const next: FollowState = followState === "none" ? (isPrivate ? "requested" : "following") : "none";
    setFollowOver(next);
    toggleFollowState(handle, account.id).catch(() => {});
  }

  return (
    <div className="absolute inset-0 z-[1200] flex flex-col bg-shell fade-in">
      <div className="safe-top flex items-center gap-3 border-b border-ink/10 px-4 pb-3 pt-4">
        <button onClick={onClose} className="-ml-1 text-ink2"><Chevron size={22} style={{ transform: "rotate(180deg)" }} /></button>
        <span className="flex items-center gap-1 text-sm font-semibold">{name}{verified && <span className="text-brand"><Verified size={13} /></span>}</span>
      </div>

      <div className="scroll-area pb-24">
        {/* profile header */}
        <div className="px-5 pt-5">
          <div className="flex items-center gap-4">
            <Avatar photo={photo} name={name} color={color} size={76} />
            <div className="flex flex-1 justify-around text-center">
              <button onClick={() => !locked && setFollowList("following")}><Stat n={following} label="Following" /></button>
              <button onClick={() => !locked && setFollowList("followers")}><Stat n={followers} label="Followers" /></button>
              <Stat n={totalLikes} label="Likes" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-1.5 font-semibold">{name}{verified && <span className="text-brand"><Verified size={14} /></span>}<span className="text-xs font-normal text-ink3">@{handle}</span></div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-ink2"><Pin size={12} /> {neighborhood}, Miami FL</div>
            {isMe && account.email && <div className="text-xs text-ink3">{account.email}</div>}
            <p className="mt-2 text-sm text-ink2">{bio}</p>
            {totalEngagement > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand">
                {totalLikes.toLocaleString()} likes · community rank by engagement
              </div>
            )}
          </div>

          {!isMe && (
            <div className="mt-4 flex gap-2">
              <button onClick={doFollow} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${followState === "none" ? "bg-brand text-white" : "border border-ink/15 text-ink2"}`}>
                {followState === "following" ? "Following" : followState === "requested" ? "Requested" : isPrivate ? "Request to follow" : "Follow"}
              </button>
              <button onClick={() => setMessaging(true)} className="flex items-center justify-center gap-1.5 rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink"><Mail size={16} /> Message</button>
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-ink/10 pt-1">
          {loading ? <p className="py-10 text-center text-sm text-ink3">Loading posts…</p>
            : locked ? (
              <div className="flex flex-col items-center px-10 py-12 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-ink/15 text-ink2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </span>
                <p className="mt-3 text-sm font-semibold">This account is private</p>
                <p className="mt-1 text-xs text-ink2">{followState === "requested" ? "Your follow request is pending approval." : `Request to follow ${name} to see their posts, followers and following.`}</p>
              </div>
            )
            : <ProfileGrid posts={posts} account={account} interactions={inter} publicView emptyText={isMe ? "You haven't posted yet." : `${name} hasn't posted yet.`} />}
        </div>
      </div>

      {followList && <FollowListSheet handle={handle} kind={followList} onClose={() => setFollowList(null)} />}
      {messaging && <MessageThread handle={handle} name={name} color={color} verified={verified} onClose={() => setMessaging(false)} />}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return <div><div className="text-lg font-bold">{n.toLocaleString()}</div><div className="text-xs text-ink2">{label}</div></div>;
}
