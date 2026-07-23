"use client";

// Instagram-style followers / following list sheet. Only reachable when
// the account is public, it's your own, or your follow was approved.
import { useEffect, useState } from "react";
import { getFollowers, getFollowing, type FollowUser } from "@/lib/social";
import { useOpenProfile } from "@/lib/profileContext";
import Avatar from "@/components/Avatar";
import { Close } from "@/components/Icons";

export default function FollowListSheet({
  handle, kind, onClose,
}: {
  handle: string; kind: "followers" | "following"; onClose: () => void;
}) {
  const [users, setUsers] = useState<FollowUser[] | null>(null);
  const openProfile = useOpenProfile();

  useEffect(() => {
    (kind === "followers" ? getFollowers(handle) : getFollowing(handle)).then(setUsers).catch(() => setUsers([]));
  }, [handle, kind]);

  return (
    <div className="fade-in absolute inset-0 z-[1300] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="sheet-in safe-bottom relative flex max-h-[70%] min-h-[40%] flex-col rounded-t-3xl border-t border-ink/10 bg-card pt-3" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/20" />
        <div className="flex items-center justify-between border-b border-ink/10 px-5 pb-2.5">
          <h3 className="text-sm font-semibold capitalize">{kind}{users ? ` (${users.length})` : ""}</h3>
          <button onClick={onClose} className="text-ink2"><Close size={18} /></button>
        </div>
        <div className="scroll-area px-5 py-2">
          {users === null ? (
            <p className="py-8 text-center text-sm text-ink3">Loading…</p>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink3">{kind === "followers" ? "No followers yet." : "Not following anyone yet."}</p>
          ) : (
            users.map((u) => (
              <button key={u.handle} onClick={() => { onClose(); openProfile(u.handle); }} className="flex w-full items-center gap-3 py-2.5 text-left active:opacity-70">
                <Avatar name={u.name} color="#1b7f3a" size={40} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{u.name}</div>
                  <div className="text-xs text-ink3">@{u.handle}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
