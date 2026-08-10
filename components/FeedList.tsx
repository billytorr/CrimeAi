"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { reportPost, blockUser, getBlockedHandles, REPORT_REASONS } from "@/lib/moderation";
import { registerVideo, reportRatio, isMuted, setMuted, onMuteChange } from "@/lib/feedVideo";
import { useLang } from "@/components/LanguageProvider";
import { detectTextLang } from "@/lib/i18n";
import { apiUrl, authHeaders } from "@/lib/api";
import type { Account } from "@/lib/auth";
import {
  toggleLike, toggleSave, toggleFollow, toggleRepost, getComments, addComment, timeAgoShort, gradientFor, getProfileDirectory,
  updatePost, deletePost,
  type Post, type Comment, type Interactions, type ProfileLite,
} from "@/lib/social";
import Avatar from "@/components/Avatar";
import MessageThread from "@/components/MessageThread";
import { useOpenProfile } from "@/lib/profileContext";
import { Heart, Comment as CommentIcon, Share, Bookmark, Report, Thread as ThreadIcon, Film, Newspaper, Pin, Verified, Send, Close, Mail, Eye, Repost as RepostIcon, SoundOn, SoundOff } from "@/components/Icons";

import { catColor } from "@/lib/categories";

export default function FeedList({ posts, account, interactions, emptyText }: { posts: Post[]; account: Account; interactions: Interactions; emptyText?: string }) {
  const [, force] = useState(0);
  const [commenting, setCommenting] = useState<Post | null>(null);
  const [menuPost, setMenuPost] = useState<Post | null>(null);
  const [reporting, setReporting] = useState<Post | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const [dir, setDir] = useState<Map<string, ProfileLite>>(new Map());

  // blocked users vanish from every feed surface; the profile directory
  // (photos + Protector badges for ALL users) loads once per mount
  useEffect(() => {
    getBlockedHandles(account.id).then(setHidden).catch(() => {});
    getProfileDirectory().then(setDir).catch(() => {});
  }, [account.id]);

  async function doBlock(p: Post) {
    setMenuPost(null);
    setHidden((h) => new Set([...Array.from(h), p.handle]));
    blockUser(account.id, p.handle).catch(() => {});
  }
  const [messaging, setMessaging] = useState<Post | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const [confirmDel, setConfirmDel] = useState<Post | null>(null);
  const openProfile = useOpenProfile();
  // own-post optimistic overrides: hide deleted, show edited text immediately
  const [deleted] = useState<Set<string>>(new Set());
  const [textOver] = useState<Record<string, string>>({});

  async function onDelete(p: Post) {
    setConfirmDel(null);
    deleted.add(p.id); bump();
    try { await deletePost(p.id, account.id); }
    catch { deleted.delete(p.id); bump(); } // write rejected — bring it back
  }
  async function onEditSave(p: Post, text: string) {
    const t = text.trim(); if (!t) return;
    textOver[p.id] = t; setEditing(null); bump();
    try { await updatePost(p.id, { text: t }, account.id); }
    catch { delete textOver[p.id]; bump(); } // revert on failure
  }
  // optimistic local overrides
  const [likeOver] = useState<Record<string, boolean>>({});
  const [saveOver] = useState<Record<string, boolean>>({});
  const [followOver] = useState<Record<string, boolean>>({});
  const [likeDelta] = useState<Record<string, number>>({});
  const [repostOver] = useState<Record<string, boolean>>({});
  const [repostDelta] = useState<Record<string, number>>({});
  const [commentDelta] = useState<Record<string, number>>({});
  const bump = () => force((n) => n + 1);

  const isLiked = (id: string) => (id in likeOver ? likeOver[id] : interactions.likes.has(id));
  const isSaved = (id: string) => (id in saveOver ? saveOver[id] : interactions.saves.has(id));
  const isFollowed = (h: string) => (h in followOver ? followOver[h] : interactions.follows.has(h));
  const isReposted = (id: string) => (id in repostOver ? repostOver[id] : interactions.reposts.has(id));

  // Optimistic updates REVERT when the write is rejected. These used to
  // swallow the rejection, so a failed like (revoked session, RLS, network)
  // stayed lit until the next reload — "it worked, then it didn't". The
  // write layer now throws on failure; flipping the override back makes the
  // screen match the database.
  function onLike(p: Post) {
    const next = !isLiked(p.id); likeOver[p.id] = next; likeDelta[p.id] = (likeDelta[p.id] || 0) + (next ? 1 : -1); bump();
    toggleLike(p.id, account.id).catch(() => { likeOver[p.id] = !next; likeDelta[p.id] = (likeDelta[p.id] || 0) + (next ? -1 : 1); bump(); });
  }
  function onSave(p: Post) {
    const next = !isSaved(p.id); saveOver[p.id] = next; bump();
    toggleSave(p.id, account.id).catch(() => { saveOver[p.id] = !next; bump(); });
  }
  function onRepost(p: Post) {
    const next = !isReposted(p.id); repostOver[p.id] = next; repostDelta[p.id] = (repostDelta[p.id] || 0) + (next ? 1 : -1); bump();
    toggleRepost(p.id, account.id).catch(() => { repostOver[p.id] = !next; repostDelta[p.id] = (repostDelta[p.id] || 0) + (next ? -1 : 1); bump(); });
  }
  function onFollow(p: Post) {
    const next = !isFollowed(p.handle); followOver[p.handle] = next; bump();
    toggleFollow(p.handle, account.id).catch(() => { followOver[p.handle] = !next; bump(); });
  }
  async function onShare(p: Post) {
    const data = { title: "CrimeAI", text: p.text || "Local safety update", url: typeof location !== "undefined" ? location.href : "" };
    try { if (navigator.share) await navigator.share(data); else if (navigator.clipboard) await navigator.clipboard.writeText(`${data.text} — ${data.url}`); } catch {}
  }

  const view = (p: Post) => ({
    post: p,
    me: p.mine
      ? { photo: account.profile?.photo, name: account.name }
      : dir.get(p.handle)?.photo
        ? { photo: dir.get(p.handle)!.photo, name: p.author }
        : undefined,
    liked: isLiked(p.id), saved: isSaved(p.id), followed: isFollowed(p.handle), reposted: isReposted(p.id),
    likeCount: p.likes + (likeDelta[p.id] || 0), commentCount: p.comments + (commentDelta[p.id] || 0),
    repostCount: (p.reposts || 0) + (repostDelta[p.id] || 0),
    onLike: () => onLike(p), onSave: () => onSave(p), onFollow: () => onFollow(p), onComment: () => setCommenting(p), onShare: () => onShare(p), onRepost: () => onRepost(p),
    onMessage: () => setMessaging(p), onOpenProfile: () => openProfile(p.handle, p.id), onMenu: () => setMenuPost(p), pro: !!dir.get(p.handle)?.pro,
  });

  return (
    <>
      <div className="divide-y divide-ink/5">
        {posts.filter((p) => (!hidden.has(p.handle) || p.mine) && !deleted.has(p.id)).map((p0) => {
          const p = textOver[p0.id] !== undefined ? { ...p0, text: textOver[p0.id] } : p0;
          const v = view(p);
          if (p.kind === "reel" || p.kind === "live") return <ReelCard key={p.id} {...v} />;
          if (p.kind === "news") return <NewsCard key={p.id} {...v} />;
          return <StandardCard key={p.id} {...v} />;
        })}
      </div>
      {!posts.length && <p className="px-5 py-12 text-center text-sm text-ink3">{emptyText || "Nothing here yet."}</p>}
      {commenting && (
        <CommentSheet post={commenting} account={account} onClose={() => setCommenting(null)} onAdded={() => { commentDelta[commenting.id] = (commentDelta[commenting.id] || 0) + 1; bump(); }} />
      )}
      {messaging && (
        <MessageThread handle={messaging.handle} name={messaging.author} color={messaging.color} verified={messaging.verified} onClose={() => setMessaging(null)} />
      )}
      {menuPost && (
        <PostMenuSheet
          post={menuPost}
          isOwn={!!menuPost.mine}
          onEdit={() => { setEditing(menuPost); setMenuPost(null); }}
          onDelete={() => { setConfirmDel(menuPost); setMenuPost(null); }}
          onReport={() => { setReporting(menuPost); setMenuPost(null); }}
          onBlock={() => doBlock(menuPost)}
          onClose={() => setMenuPost(null)}
        />
      )}
      {editing && <EditPostSheet post={editing} onSave={(t) => onEditSave(editing, t)} onClose={() => setEditing(null)} />}
      {confirmDel && <ConfirmDeleteSheet onConfirm={() => onDelete(confirmDel)} onClose={() => setConfirmDel(null)} />}
      {reporting && <ReportSheet post={reporting} account={account} onClose={() => setReporting(null)} />}
    </>
  );
}

// ⋮ menu — your OWN posts get Edit / Delete; everyone else's get the safety
// controls the app stores require: report the post, or block the account.
function PostMenuSheet({ post, isOwn, onEdit, onDelete, onReport, onBlock, onClose }: { post: Post; isOwn: boolean; onEdit: () => void; onDelete: () => void; onReport: () => void; onBlock: () => void; onClose: () => void }) {
  return (
    <div className="fade-in fixed inset-0 z-[1400] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="sheet-in safe-bottom relative rounded-t-3xl border-t border-ink/10 bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/20" />
        {isOwn ? (
          <>
            <button onClick={onEdit} className="w-full rounded-xl border border-ink/10 bg-shell py-3.5 text-sm font-semibold text-ink active:scale-[0.99]">Edit post</button>
            <button onClick={onDelete} className="mt-2 w-full rounded-xl border border-ink/10 bg-shell py-3.5 text-sm font-semibold text-red-400 active:scale-[0.99]">Delete post</button>
          </>
        ) : (
          <>
            <button onClick={onReport} className="w-full rounded-xl border border-ink/10 bg-shell py-3.5 text-sm font-semibold text-red-400 active:scale-[0.99]">Report post</button>
            <button onClick={onBlock} className="mt-2 w-full rounded-xl border border-ink/10 bg-shell py-3.5 text-sm font-semibold text-red-400 active:scale-[0.99]">Block @{post.handle}</button>
          </>
        )}
        <button onClick={onClose} className="mt-2 w-full rounded-xl py-3 text-sm font-medium text-ink2">Cancel</button>
      </div>
    </div>
  );
}

// Edit your own post's text.
function EditPostSheet({ post, onSave, onClose }: { post: Post; onSave: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState(post.text || "");
  return (
    <div className="fade-in fixed inset-0 z-[1400] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="sheet-in safe-bottom relative rounded-t-3xl border-t border-ink/10 bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/20" />
        <p className="mb-2 text-sm font-semibold text-ink">Edit post</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus
          className="w-full resize-none rounded-xl border border-ink/10 bg-shell p-3 text-sm text-ink outline-none focus:border-brand/60" />
        <div className="mt-3 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-ink/10 py-3 text-sm font-medium text-ink2 active:scale-[0.99]">Cancel</button>
          <button onClick={() => onSave(text)} disabled={!text.trim()} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteSheet({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fade-in fixed inset-0 z-[1400] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="sheet-in safe-bottom relative rounded-t-3xl border-t border-ink/10 bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/20" />
        <p className="mb-1 text-center text-sm font-semibold text-ink">Delete this post?</p>
        <p className="mb-4 text-center text-xs text-ink3">This can&apos;t be undone.</p>
        <button onClick={onConfirm} className="w-full rounded-xl bg-red-500 py-3.5 text-sm font-semibold text-white active:scale-[0.99]">Delete post</button>
        <button onClick={onClose} className="mt-2 w-full rounded-xl py-3 text-sm font-medium text-ink2">Cancel</button>
      </div>
    </div>
  );
}

function ReportSheet({ post, account, onClose }: { post: Post; account: Account; onClose: () => void }) {
  const [reason, setReason] = useState("inappropriate");
  const [sent, setSent] = useState(false);
  async function submit() {
    reportPost(post.id, account.id, reason).catch(() => {});
    setSent(true);
    setTimeout(onClose, 1400);
  }
  return (
    <div className="fade-in fixed inset-0 z-[1400] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="sheet-in safe-bottom relative rounded-t-3xl border-t border-ink/10 bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/20" />
        {sent ? (
          <p className="py-8 text-center text-sm font-semibold text-ink">Thanks — our safety team will review this.</p>
        ) : (
          <>
            <h3 className="mb-3 text-sm font-semibold">Why are you reporting this post?</h3>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <button key={r.id} onClick={() => setReason(r.id)} className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-sm ${reason === r.id ? "border-brand/50 bg-brand/10 text-ink" : "border-ink/10 text-ink2"}`}>
                  {r.label}
                  {reason === r.id && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                </button>
              ))}
            </div>
            <button onClick={submit} className="mt-3 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white active:scale-[0.99]">Submit report</button>
          </>
        )}
      </div>
    </div>
  );
}

type V = {
  post: Post; me?: { photo?: string; name: string }; liked: boolean; saved: boolean; followed: boolean; reposted: boolean;
  likeCount: number; commentCount: number; repostCount: number;
  onLike: () => void; onSave: () => void; onFollow: () => void; onComment: () => void; onShare: () => void; onMessage: () => void; onOpenProfile: () => void; onRepost: () => void; onMenu: () => void; pro: boolean;
};

// "I saw this too" — community corroboration (Phase 9). Advances the
// report's verification pipeline and earns the corroborator PENDING points
// that settle once the report is confirmed. Purely additive to the card.
function Corroborate({ reportId }: { reportId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function confirm() {
    if (state !== "idle") return;
    setState("busy");
    try {
      const h = await authHeaders();
      const r = await fetch(apiUrl("/api/reports/corroborate"), {
        method: "POST", headers: { "Content-Type": "application/json", ...h },
        body: JSON.stringify({ reportId }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setState("done"); return; }
      setState("error"); setMsg(d.error || "Couldn't confirm right now.");
    } catch { setState("error"); setMsg("Network error."); }
  }
  if (state === "done") return <span className="text-xs font-medium text-green-500">✓ You confirmed this</span>;
  return (
    <button onClick={confirm} disabled={state === "busy"}
      className="rounded-full border border-ink/15 px-2.5 py-1 text-xs font-medium text-ink2 active:scale-95 disabled:opacity-50">
      {state === "busy" ? "Confirming…" : state === "error" ? msg : "I saw this too"}
    </button>
  );
}

function Badge({ post }: { post: Post }) {
  if (post.kind === "report" && post.category) return <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${catColor(post.category)}22`, color: catColor(post.category) }}><Report size={11} />REPORT</span>;
  if (post.kind === "thread") return <span className="flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300"><ThreadIcon size={11} />THREAD</span>;
  if (post.kind === "reel") return <span className="flex items-center gap-1 rounded bg-pink-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-pink-300"><Film size={11} />REEL</span>;
  return null;
}

function Head({ post, me, followed, onFollow, onMessage, onMenu, pro }: { post: Post; me?: { photo?: string; name: string }; followed: boolean; onFollow: () => void; onMessage: () => void; onMenu: () => void; pro?: boolean }) {
  const open = useOpenProfile();
  return (
    <div className="flex items-center gap-2.5">
      <button onClick={() => open(post.handle, post.id)} className="active:scale-95"><Avatar photo={me?.photo} name={me?.name || post.author} color={post.color} size={38} /></button>
      <div className="min-w-0 flex-1">
        <button onClick={() => open(post.handle, post.id)} className="flex items-center gap-1 text-sm">
          <span className="truncate font-semibold text-ink">{post.author}</span>
          {post.verified && <span className="text-brand"><Verified size={13} /></span>}
          <Badge post={post} />
        </button>
        <div className="flex items-center gap-1 text-[11px] text-ink3"><Pin size={11} /> {post.neighborhood} · {timeAgoShort(post.createdAt)}</div>
      </div>
      {post.mine ? (
        <button onClick={onMenu} aria-label="Post options" className="px-0.5 text-ink3 active:scale-95">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <button onClick={onMessage} aria-label="Message" className="grid h-8 w-8 place-items-center rounded-full border border-ink/15 text-ink2 active:scale-95"><Mail size={15} /></button>
          <button onClick={onFollow} className={`rounded-full px-3 py-1 text-xs font-semibold ${followed ? "border border-ink/15 text-ink2" : "bg-brand/15 text-brand"}`}>{followed ? "Following" : "Follow"}</button>
          <button onClick={onMenu} aria-label="Post options" className="px-0.5 text-ink3 active:scale-95">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function ActionBar(v: V) {
  return (
    <div className="mt-3 flex items-center gap-6 text-ink2">
      <button onClick={v.onLike} className={`flex items-center gap-1.5 text-sm ${v.liked ? "text-red-400" : ""}`}><Heart size={20} filled={v.liked} /> {v.likeCount}</button>
      <button onClick={v.onComment} className="flex items-center gap-1.5 text-sm"><CommentIcon size={20} /> {v.commentCount}</button>
      <button onClick={v.onRepost} className={`flex items-center gap-1.5 text-sm ${v.reposted ? "text-brand" : ""}`}><RepostIcon size={19} /> {v.repostCount}</button>
      <button onClick={v.onShare} className="flex items-center gap-1.5 text-sm"><Share size={19} /> {v.post.shares}</button>
      <button onClick={v.onSave} className={`ml-auto ${v.saved ? "text-brand" : ""}`}><Bookmark size={20} filled={v.saved} /></button>
    </div>
  );
}

function Media({ post, tall }: { post: Post; tall?: boolean }) {
  const isReel = post.kind === "reel" || post.kind === "live";
  if (post.media) {
    if (post.media.type === "image") {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={post.media.url} alt="" className={`w-full rounded-xl object-cover ${tall ? "h-[58vh]" : "max-h-80"}`} />;
    }
    // Every feed video autoplays one-at-a-time with sound the user can
    // mute/unmute (TikTok / Instagram behavior) — see FeedVideo.
    return isReel ? (
      <FeedVideo src={post.media.url} className="h-[58vh] w-full rounded-xl object-cover" mutePos="tr" />
    ) : (
      <FeedVideo src={post.media.url} className={`w-full rounded-xl object-cover ${tall ? "max-h-[60vh]" : "max-h-80"}`} mutePos="br" />
    );
  }
  // Fallback tile only for media-less posts (rare) — keeps layout stable.
  return (
    <div className={`relative grid place-items-center overflow-hidden rounded-xl ${tall ? "h-[58vh]" : "h-52"}`} style={{ background: gradientFor(post.id) }}>
      <div className="absolute inset-0 bg-black/10" />
      <span className="absolute bottom-2 left-2 rounded-md bg-black/40 px-2 py-0.5 text-xs text-white/90 backdrop-blur-sm">Local clip</span>
    </div>
  );
}

// Autoplaying feed video. Registers with the shared controller so only
// the most-visible video plays, and exposes the global mute toggle.
function FeedVideo({ src, className, mutePos }: { src: string; className: string; mutePos: "tr" | "br" }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMutedState] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setMutedState(isMuted());
    el.muted = isMuted();
    const unregister = registerVideo(el);
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) reportRatio(el, e.isIntersecting ? e.intersectionRatio : 0); },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 0.9, 1] }
    );
    io.observe(el);
    const off = onMuteChange((m) => { setMutedState(m); if (ref.current) ref.current.muted = m; });
    return () => { io.disconnect(); unregister(); off(); };
  }, []);

  // Tapping the video is the natural "I want sound" gesture (IG-style):
  // while muted, a tap turns sound on for this and every later video;
  // once unmuted, a tap toggles play/pause.
  const onVideoTap = () => {
    const el = ref.current;
    if (!el) return;
    if (isMuted()) { setMuted(false); el.play().catch(() => {}); return; }
    el.paused ? el.play().catch(() => {}) : el.pause();
  };
  const pos = mutePos === "tr" ? "right-3 top-3" : "right-3 bottom-3";

  return (
    <div className="relative">
      <video
        ref={ref}
        src={src}
        className={className}
        loop
        muted={muted}
        playsInline
        preload="metadata"
        onClick={onVideoTap}
      />
      {/* discoverable sound affordance while muted */}
      {muted && (
        <button
          onClick={(e) => { e.stopPropagation(); setMuted(false); ref.current?.play().catch(() => {}); }}
          className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm active:scale-95"
        >
          <SoundOff size={14} /> Tap for sound
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); setMuted(!isMuted()); ref.current?.play().catch(() => {}); }}
        className={`absolute ${pos} z-10 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-90`}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <SoundOff size={16} /> : <SoundOn size={16} />}
      </button>
    </div>
  );
}

// Post text with an Instagram/TikTok-style "See translation" toggle. The
// button only appears when the post's detected language differs from the
// reader's app language; tapping it translates via /api/translate and
// toggles back to the original.
function PostText({ text, className, light }: { text: string; className?: string; light?: boolean }) {
  const { lang, t } = useLang();
  const detected = useMemo(() => detectTextLang(text), [text]);
  const canTranslate = !!detected && detected !== lang;
  const [translated, setTranslated] = useState<string | null>(null);
  const [showing, setShowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    if (showing) { setShowing(false); return; }
    if (translated) { setShowing(true); return; }
    setBusy(true); setFailed(false);
    try {
      const r = await fetch(apiUrl("/api/translate"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target: lang, source: detected }),
      });
      const d = await r.json();
      if (r.ok && d.translated) { setTranslated(d.translated); setShowing(true); }
      else setFailed(true);
    } catch { setFailed(true); }
    setBusy(false);
  }

  const btnColor = light ? "text-white/75" : "text-ink3";
  return (
    <>
      <p className={className}>{showing && translated ? translated : text}</p>
      {canTranslate && !failed && (
        <button onClick={toggle} className={`mt-1 text-xs font-semibold ${btnColor}`}>
          {busy ? `${t("Translating")}…` : showing ? t("See original") : t("See translation")}
        </button>
      )}
    </>
  );
}

function StandardCard(v: V) {
  const { post } = v;
  const hasMedia = post.media || post.scene;
  return (
    <article className="px-5 py-4">
      <Head post={post} me={v.me} followed={v.followed} onFollow={v.onFollow} onMessage={v.onMessage} onMenu={v.onMenu} pro={v.pro} />
      {post.text && <PostText text={post.text} className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink" />}
      {post.thread && post.thread.length > 0 && <div className="mt-2 space-y-2 border-l-2 border-violet-500/40 pl-3">{post.thread.map((t, i) => <p key={i} className="text-[14px] leading-relaxed text-ink2">{t}</p>)}</div>}
      {hasMedia && <div className="mt-2.5"><Media post={post} /></div>}
      {post.tags && post.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{post.tags.map((t) => <span key={t} className="text-xs text-blu">#{t}</span>)}</div>}
      {post.kind === "report" && (
        <div className="mt-2 flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-brand"><Pin size={12} /> Pinned on the map</span>
          {!post.mine && <Corroborate reportId={post.id} />}
        </div>
      )}
      <ActionBar {...v} />
    </article>
  );
}

function ReelCard(v: V) {
  const { post } = v;
  return (
    <article className="relative overflow-hidden">
      <div className="relative">
        <Media post={post} tall />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
        {/* LIVE / replay badge */}
        {post.kind === "live" && (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
            {post.isLive
              ? <><span className="pulse rounded-md bg-signal-red px-2 py-1 text-[11px] font-bold text-white">● LIVE</span>{post.viewers != null && <span className="flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-[11px] text-white backdrop-blur"><Eye size={12} /> {post.viewers.toLocaleString()}</span>}</>
              : <span className="rounded-md bg-black/50 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">▷ LIVE REPLAY{post.durationSec ? ` · 0:${String(post.durationSec).padStart(2, "0")}` : ""}</span>}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="flex items-center gap-2">
            <button onClick={() => v.onOpenProfile()} className="active:scale-95"><Avatar photo={v.me?.photo} name={v.me?.name || post.author} color={post.color} size={32} /></button>
            <button onClick={() => v.onOpenProfile()} className="flex items-center gap-1 text-sm font-semibold text-white">{post.author}{post.verified && <Verified size={13} />}</button>
            <span className="text-[11px] text-white/70">· {timeAgoShort(post.createdAt)}</span>
            {!post.mine && <button onClick={v.onMessage} aria-label="Message" className="ml-1 grid h-7 w-7 place-items-center rounded-full border border-white/40 text-white active:scale-95"><Mail size={13} /></button>}
            {!post.mine && <button onClick={v.onFollow} className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${v.followed ? "border border-white/30 text-white/80" : "bg-white text-black"}`}>{v.followed ? "Following" : "Follow"}</button>}
            <button onClick={v.onMenu} aria-label="Post options" className={`px-0.5 text-white/80 ${post.mine ? "ml-1" : ""}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg></button>
          </div>
          <div className="mt-2 max-w-[80%]"><PostText text={post.text} className="text-sm leading-snug text-white/95" light /></div>
          {post.tags && <div className="mt-1 flex flex-wrap gap-1.5">{post.tags.map((t) => <span key={t} className="text-xs text-brand">#{t}</span>)}</div>}
        </div>
        <div className="absolute bottom-4 right-3 flex flex-col items-center gap-4 text-white">
          <Rail onClick={v.onLike} active={v.liked}><Heart size={24} filled={v.liked} /></Rail><Count>{v.likeCount}</Count>
          <Rail onClick={v.onComment}><CommentIcon size={24} /></Rail><Count>{v.commentCount}</Count>
          <Rail onClick={v.onRepost} active={v.reposted}><RepostIcon size={23} /></Rail><Count>{v.repostCount}</Count>
          <Rail onClick={v.onShare}><Share size={23} /></Rail><Count>{post.shares}</Count>
          <Rail onClick={v.onSave} active={v.saved}><Bookmark size={23} filled={v.saved} /></Rail>
        </div>
      </div>
    </article>
  );
}
function Rail({ children, onClick, active }: { children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return <button onClick={onClick} className={`grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur-sm ${active ? "text-red-400" : "text-white"}`}>{children}</button>;
}
function Count({ children }: { children: React.ReactNode }) { return <span className="-mt-3 text-[11px] font-medium text-white">{children}</span>; }

function NewsCard(v: V) {
  const { post } = v;
  return (
    <article className="px-5 py-4">
      <div className="flex gap-3 rounded-2xl border border-ink/10 bg-card/60 p-3.5">
        {post.media?.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.media.url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl text-ink/90" style={{ background: gradientFor(post.id) }}><Newspaper size={28} /></div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-blu"><span className="rounded bg-blu/15 px-1.5 py-0.5 font-semibold">NEWS</span><span className="text-ink2">{post.source} · {timeAgoShort(post.createdAt)}</span></div>
          <PostText text={post.text} className="mt-1 text-sm font-medium leading-snug text-ink" />
          <div className="mt-1.5 flex items-center gap-4 text-xs text-ink2">
            <button onClick={v.onLike} className={`flex items-center gap-1 ${v.liked ? "text-red-400" : ""}`}><Heart size={16} filled={v.liked} /> {v.likeCount}</button>
            <button onClick={v.onComment} className="flex items-center gap-1"><CommentIcon size={16} /> {v.commentCount}</button>
            <button onClick={v.onShare} className="flex items-center gap-1"><Share size={15} /> {post.shares}</button>
          </div>
        </div>
      </div>
    </article>
  );
}

function CommentSheet({ post, account, onClose, onAdded }: { post: Post; account: Account; onClose: () => void; onAdded: () => void }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { getComments(post.id).then((c) => { setComments(c); setLoading(false); }); }, [post.id]);

  async function submit() {
    const t = text.trim(); if (!t) return;
    setText("");
    setComments((c) => [...c, { author: account.name, text: t, ts: new Date().toISOString(), photo: account.profile?.photo }]);
    onAdded();
    await addComment(post.id, account.name, t, account.id).catch(() => {});
  }

  return (
    <div className="absolute inset-0 z-[1200] flex flex-col justify-end fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="sheet-in safe-bottom relative flex max-h-[80%] flex-col rounded-t-3xl border-t border-ink/10 bg-card pt-3" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/20" />
        <div className="mb-2 flex items-center justify-between px-5"><h3 className="text-sm font-semibold text-ink">Comments</h3><button onClick={onClose} className="text-ink2"><Close size={18} /></button></div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-3">
          {loading ? <p className="py-8 text-center text-sm text-ink3">Loading…</p> : comments.length === 0 ? <p className="py-8 text-center text-sm text-ink3">No comments yet. Be the first.</p> : comments.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <Avatar photo={c.photo} name={c.author} color="#1b7f3a" size={32} />
              <div className="min-w-0 flex-1"><div className="text-xs"><span className="font-semibold text-ink">{c.author}</span> <span className="text-ink3">· {timeAgoShort(c.ts)}</span></div><p className="text-sm text-ink2">{c.text}</p></div>
            </div>
          ))}
        </div>
        <div className="safe-bottom flex items-center gap-2 border-t border-ink/10 p-3">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Add a comment…" className="w-full rounded-full border border-ink/10 bg-shell px-4 py-2.5 text-sm outline-none placeholder:text-ink3 focus:border-brand/60" />
          <button onClick={submit} disabled={!text.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-50"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
}
