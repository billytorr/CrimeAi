// ── Social layer ─────────────────────────────────────────────
// Async data API for the community feed: posts (reels/threads/images/
// reports), likes, saves, follows, comments. Backed by Supabase when
// configured (real cross-device sync) and by localStorage otherwise
// (zero-config demo). All exported data functions are async.
import { NEIGHBORHOODS } from "./data";
import type { Category } from "./types";
import { supabase, supabaseEnabled, rowToPost, postToRow } from "./supabase";
import { track } from "./analytics";

export type PostKind = "report" | "observation" | "news" | "system" | "reel" | "thread" | "image" | "live";

export interface Post {
  id: string; kind: PostKind; author: string; handle: string; color: string; verified: boolean;
  neighborhood: string; lat: number; lon: number; text: string; category?: string;
  media?: { type: "image" | "video"; url: string }; scene?: string; durationSec?: number;
  thread?: string[]; tags?: string[]; source?: string; createdAt: string;
  likes: number; comments: number; shares: number; reposts?: number; mine?: boolean;
  isLive?: boolean; viewers?: number; // live streams
}
export interface LocalUser { name: string; handle: string; color: string; neighborhood: string; verified: boolean; followers: number; following: number; bio: string; email: string; phone: string }
export interface Comment { author: string; text: string; ts: string }

const nb = (name: string) => NEIGHBORHOODS.find((n) => n.name === name) || NEIGHBORHOODS[0];
const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

// Seeded community accounts — real "users" in the network. Each has a
// profile page reachable by tapping their name/avatar anywhere in the app.
export const LOCAL_USERS: LocalUser[] = [
  { name: "Brickell Watch", handle: "brickellwatch", color: "#0ea5e9", neighborhood: "Brickell", verified: true, followers: 4200, following: 180, bio: "Resident-run neighborhood watch for Brickell. Verified alerts, coordinated with MDPD. Report — don't confront.", email: "brickellwatch@crimeai.app", phone: "+1 (305) 555-0142" },
  { name: "Carlos M.", handle: "carlos_mia", color: "#f59e0b", neighborhood: "Little Havana", verified: false, followers: 312, following: 240, bio: "Little Havana local. Eyes on my block, looking out for neighbors.", email: "carlos.m@crimeai.app", phone: "+1 (305) 555-0188" },
  { name: "Wynwood Pulse", handle: "wynwoodpulse", color: "#ec4899", neighborhood: "Wynwood", verified: true, followers: 2890, following: 95, bio: "Real-time eyes on Wynwood nightlife & street safety. Stay aware out there.", email: "wynwoodpulse@crimeai.app", phone: "+1 (305) 555-0117" },
  { name: "Aisha R.", handle: "aisha305", color: "#10b981", neighborhood: "Edgewater", verified: false, followers: 540, following: 410, bio: "Edgewater neighbor organizing our community watch. Lighting + cameras + each other.", email: "aisha.r@crimeai.app", phone: "+1 (305) 555-0163" },
  { name: "SoBe Neighbors", handle: "sobeneighbors", color: "#6366f1", neighborhood: "South Beach", verified: true, followers: 6100, following: 220, bio: "South Beach residents looking out for one another. Tips, alerts, and patrol updates.", email: "sobeneighbors@crimeai.app", phone: "+1 (305) 555-0199" },
  { name: "Dwayne K.", handle: "dwaynek", color: "#14b8a6", neighborhood: "Coconut Grove", verified: false, followers: 188, following: 160, bio: "Coconut Grove. Safe streets, good neighbors, well-lit sidewalks.", email: "dwayne.k@crimeai.app", phone: "+1 (305) 555-0124" },
  { name: "Gables Alert", handle: "gablesalert", color: "#22c55e", neighborhood: "Coral Gables", verified: true, followers: 1750, following: 130, bio: "Coral Gables safety tips & package-theft prevention. Lock it, light it, report it.", email: "gablesalert@crimeai.app", phone: "+1 (305) 555-0171" },
];
export const userByHandle = (handle: string) => LOCAL_USERS.find((u) => u.handle === handle);

const GRADIENTS = [["#0ea5e9", "#1e3a8a"], ["#f59e0b", "#7c2d12"], ["#ec4899", "#581c87"], ["#10b981", "#064e3b"], ["#6366f1", "#1e1b4b"], ["#ef4444", "#450a0a"], ["#14b8a6", "#0f766e"], ["#a855f7", "#3b0764"]];
export function gradientFor(id: string): string {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  const [a, b] = GRADIENTS[h % GRADIENTS.length]; return `linear-gradient(150deg, ${a}, ${b})`;
}
export function trendingScore(p: Post): number { return p.likes + p.comments * 3 + p.shares * 2; }

// "For You" relevance — personalizes the feed by the viewer's location,
// who they follow, and their interests (alert categories + home area).
export interface ForYouCtx {
  lat: number; lon: number; neighborhood: string;
  follows: Set<string>; interests: string[];
}
function haversineMi(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8, dLat = ((bLat - aLat) * Math.PI) / 180, dLon = ((bLon - aLon) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180, la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function rankForYou(posts: Post[], ctx: ForYouCtx): Post[] {
  const homeTag = ctx.neighborhood.toLowerCase().replace(/\s+/g, "");
  const score = (p: Post) => {
    const mins = (Date.now() - +new Date(p.createdAt)) / 60000;
    let s = 1200 - Math.min(1200, mins);                       // recency
    if (p.mine) s += 4000;                                      // your own posts up top
    if (ctx.follows.has(p.handle)) s += 5000;                  // following
    s += Math.max(0, 1800 - haversineMi(ctx.lat, ctx.lon, p.lat, p.lon) * 280); // proximity
    if (p.category && ctx.interests.includes(p.category)) s += 900;             // interest (alert type)
    if (p.tags?.some((t) => t.toLowerCase() === homeTag)) s += 700;             // your neighborhood
    if (p.media) s += 150;                                      // richer posts surface a bit higher
    s += Math.min(1400, trendingScore(p) / 3);                 // engagement (likes/comments/shares)
    if (p.isLive) s += 9000;                                    // live streams jump to the top
    return s;
  };
  return [...posts].sort((a, b) => score(b) - score(a));
}
export function timeAgoShort(iso: string): string {
  const m = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (m < 1) return "now"; if (m < 60) return `${m}m`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h`; return `${Math.round(h / 24)}d`;
}

// ── real local media (served from /public/feed) ─────────────
const VID = (f: string) => ({ type: "video" as const, url: `/feed/${f}` });
const IMG = (f: string) => ({ type: "image" as const, url: `/feed/${f}` });

// ── seed content (localStorage fallback only) ────────────────
function seedPosts(): Post[] {
  const u = (h: string) => LOCAL_USERS.find((x) => x.handle === h)!;
  const mk = (handle: string, text: string, mins: number, extra: Partial<Post> = {}): Post => {
    const a = u(handle), n = nb(a.neighborhood);
    return { id: `seed-${handle}-${mins}`, kind: "observation", author: a.name, handle: a.handle, color: a.color, verified: a.verified, neighborhood: a.neighborhood, lat: n.lat + (Math.random() - 0.5) * 0.01, lon: n.lon + (Math.random() - 0.5) * 0.01, text, createdAt: minsAgo(mins), likes: Math.floor(Math.random() * 120), comments: Math.floor(Math.random() * 40), shares: Math.floor(Math.random() * 25), ...extra };
  };
  return [
    // A neighbor currently LIVE — shows at the top of the feed for followers/local.
    mk("sobeneighbors", "LIVE: following a group acting suspicious around parked cars on Collins. MDPD notified. Stay back, do not engage.", 1, { kind: "live", isLive: true, viewers: 1280, media: VID("clip-3045163.mp4"), tags: ["southbeach", "live", "suspicious"], likes: 540, comments: 96, shares: 41 }),
    mk("wynwoodpulse", "Wynwood after dark — busy, but heavy security and patrols out tonight. Stay with your group and watch your phones.", 14, { kind: "reel", media: VID("clip-2099536.mp4"), durationSec: 18, tags: ["wynwood", "nightlife", "safety"], likes: 1840, comments: 212, shares: 96 }),
    mk("sobeneighbors", "Ocean Dr right now: big crowd, lots of MDPD presence near 8th. Keep an eye on your stuff in the crowd.", 39, { kind: "reel", media: VID("clip-3045163.mp4"), durationSec: 25, tags: ["southbeach", "patrol", "live"], likes: 3120, comments: 388, shares: 140 }),
    mk("aisha305", "Edgewater waterfront tonight — newly added lighting makes the walk feel a lot safer after dark.", 64, { kind: "reel", media: VID("clip-1093662.mp4"), durationSec: 12, tags: ["edgewater", "lighting", "live"], likes: 720, comments: 58, shares: 33 }),
    mk("brickellwatch", "How to avoid car break-ins in Brickell", 70, { kind: "thread", thread: ["1. Never leave bags, chargers, or sunglasses visible. Around 80% of break-ins target visible items.", "2. Park in lit garages, not street spots, after 10pm.", "3. Report attempts here so the whole block gets the alert in real time."], tags: ["brickell", "safetytips"], likes: 940, comments: 77, shares: 210 }),
    mk("aisha305", "We're launching an Edgewater neighborhood watch — first meetup Thursday 7pm at the park. All neighbors welcome. Let's look out for each other.", 120, { kind: "image", media: IMG("crime-watch.jpg"), tags: ["edgewater", "neighborhoodwatch"], likes: 612, comments: 54, shares: 30 }),
    mk("dwaynek", "City finally fixed the streetlights on our block in the Grove. Walking home at night feels so much safer now — lighting really is crime prevention.", 280, { kind: "image", media: IMG("crime-carnight.jpg"), tags: ["coconutgrove", "lighting", "safetytips"], likes: 410, comments: 22, shares: 12 }),
    mk("brickellwatch", "Caught on a doorbell cam: group checking car door handles on the 1100 block of SW 2nd Ave around 1am. Lock up and bring valuables inside.", 22, { kind: "report", category: "property", media: IMG("crime-doorbell.jpg"), tags: ["brickell", "breakin"], likes: 320, comments: 64, shares: 88 }),
    mk("carlos_mia", "Two MDPD units responding on SW 8th near 17th Ave. Looked like a minor crash — avoid the block for a bit.", 130, { kind: "report", category: "hazard", media: IMG("crime-police.jpg"), tags: ["littlehavana", "police"], likes: 96, comments: 18, shares: 9 }),
    mk("gablesalert", "Porch-pirate season is here. A video doorbell is the cheapest deterrent there is — schedule deliveries for when you're home and report thefts so we can map the hotspots.", 220, { kind: "image", media: IMG("crime-doorbell.jpg"), tags: ["coralgables", "packagetheft", "safetytips"], likes: 188, comments: 31, shares: 22 }),
  ];
}
function seedNews(): Post[] {
  const c = nb("Downtown Miami");
  const mk = (source: string, text: string, mins: number, neighborhood: string, media: Post["media"]): Post => ({ id: `news-${source}-${mins}`, kind: "news", author: source, handle: source.toLowerCase().replace(/\s/g, ""), color: "#0284c7", verified: true, neighborhood, lat: c.lat, lon: c.lon, text, source, media, createdAt: minsAgo(mins), likes: Math.floor(Math.random() * 400), comments: Math.floor(Math.random() * 90), shares: Math.floor(Math.random() * 60) });
  return [
    mk("Local 10 News", "Miami-Dade PD increases patrols in Brickell and Downtown ahead of weekend events.", 35, "Brickell", IMG("crime-police.jpg")),
    mk("WSVN 7", "City of Miami expands its real-time crime data dashboard with weekly updates.", 110, "Downtown Miami", IMG("crime-patrol.jpg")),
    mk("Miami Herald", "Wynwood neighbors push for better lighting after a string of car break-ins.", 190, "Wynwood", IMG("crime-carnight.jpg")),
    mk("CBS Miami", "Hurricane season prep: county shares flood-zone and evacuation resources.", 300, "Miami", IMG("img-beach.jpg")),
  ];
}
let _seedCache: Post[] | null = null;
const seeds = () => (_seedCache ??= [...seedPosts(), ...seedNews()]);

// ── localStorage stores ──────────────────────────────────────
const POSTS_KEY = "pscc_posts", LIKES_KEY = "pscc_likes", SAVES_KEY = "pscc_saves", FOLLOWS_KEY = "pscc_follows", COMMENTS_KEY = "pscc_comments", REPOSTS_KEY = "pscc_reposts";
function readMine(): Post[] { if (typeof window === "undefined") return []; try { return JSON.parse(localStorage.getItem(POSTS_KEY) || "[]"); } catch { return []; } }
function setStore(k: string, s: Set<string>) { localStorage.setItem(k, JSON.stringify([...s])); }
function getStore(k: string): Set<string> { if (typeof window === "undefined") return new Set(); try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch { return new Set(); } }
function readComments(): Record<string, Comment[]> { if (typeof window === "undefined") return {}; try { return JSON.parse(localStorage.getItem(COMMENTS_KEY) || "{}"); } catch { return {}; } }

export interface Interactions { likes: Set<string>; saves: Set<string>; follows: Set<string>; requested: Set<string>; reposts: Set<string> }

// ── public async API ─────────────────────────────────────────
export async function getFeed(userId?: string): Promise<Post[]> {
  if (supabaseEnabled) {
    const { data } = await supabase!.from("posts").select("*").order("created_at", { ascending: false }).limit(200);
    return (data || []).map((r) => ({ ...rowToPost(r), mine: !!userId && r.user_id === userId }));
  }
  const local = readMine();
  const liked = getStore(LIKES_KEY);
  const cmts = readComments();
  return [...local, ...seeds()]
    .map((p) => ({ ...p, likes: p.likes + (liked.has(p.id) ? 1 : 0), comments: p.comments + (cmts[p.id]?.length || 0) }))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function myPosts(userId: string): Promise<Post[]> {
  if (supabaseEnabled) {
    const { data } = await supabase!.from("posts").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    return (data || []).map((r) => ({ ...rowToPost(r), mine: true }));
  }
  return readMine();
}

// Every post on a given user's profile (timestamped, newest first).
export async function postsByHandle(handle: string, userId?: string): Promise<Post[]> {
  if (supabaseEnabled) {
    const { data } = await supabase!.from("posts").select("*").eq("handle", handle).order("created_at", { ascending: false });
    return (data || []).map((r) => ({ ...rowToPost(r), mine: !!userId && r.user_id === userId }));
  }
  const feed = await getFeed(userId);
  return feed.filter((p) => p.handle === handle);
}

export async function savedPosts(userId: string): Promise<Post[]> {
  const inter = await getInteractions(userId);
  return (await getFeed(userId)).filter((p) => inter.saves.has(p.id));
}

// Real follower/following counts straight from the follows table — every
// account (community personas included) is a real user, so nothing here
// is a mock number. Returns null in offline demo mode.
export interface UserStats { followers: number; following: number; isPrivate: boolean; userId?: string; bio?: string; name?: string; photo?: string; plan?: string }
export async function getUserStats(handle: string): Promise<UserStats | null> {
  if (!supabaseEnabled) return null;
  const { count: followers } = await supabase!
    .from("follows").select("*", { count: "exact", head: true }).eq("target_handle", handle).eq("status", "approved");
  // A user's id comes from profiles.handle; older accounts without a
  // handle fall back to matching the email prefix.
  const { data: profs } = await supabase!
    .from("profiles").select("id, is_private, bio, name, photo_url, plan").or(`handle.eq.${handle},email.like.${handle}@%`).limit(1);
  let following = 0;
  if (profs && profs.length) {
    const { count } = await supabase!
      .from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profs[0].id).eq("status", "approved");
    following = count || 0;
  }
  return { followers: followers || 0, following, isPrivate: !!profs?.[0]?.is_private, userId: profs?.[0]?.id, bio: profs?.[0]?.bio || "", name: profs?.[0]?.name || "", photo: profs?.[0]?.photo_url || "", plan: profs?.[0]?.plan || "free" };
}

// Handles of every Protector (paid) user — powers the red badge on
// posts and profiles app-wide. One cheap query, cached per feed mount.
export async function getProHandles(): Promise<Set<string>> {
  if (!supabaseEnabled) return new Set();
  const { data } = await supabase!.from("profiles").select("handle, email").eq("plan", "pro");
  return new Set((data || []).map((p) => p.handle || p.email?.split("@")[0] || "").filter(Boolean));
}

// ── follower / following lists + follow requests ─────────────
export interface FollowUser { name: string; handle: string; verified?: boolean }

export async function getFollowers(handle: string): Promise<FollowUser[]> {
  if (!supabaseEnabled) return [];
  const { data: rows } = await supabase!.from("follows").select("follower_id").eq("target_handle", handle).eq("status", "approved");
  const ids = (rows || []).map((r) => r.follower_id);
  if (!ids.length) return [];
  const { data: profs } = await supabase!.from("profiles").select("name, handle, email").in("id", ids);
  return (profs || []).map((p) => ({ name: p.name, handle: p.handle || p.email?.split("@")[0] || "user" }));
}

export async function getFollowing(handle: string): Promise<FollowUser[]> {
  if (!supabaseEnabled) return [];
  const { data: profs } = await supabase!.from("profiles").select("id").or(`handle.eq.${handle},email.like.${handle}@%`).limit(1);
  if (!profs?.length) return [];
  const { data: rows } = await supabase!.from("follows").select("target_handle").eq("follower_id", profs[0].id).eq("status", "approved");
  const handles = (rows || []).map((r) => r.target_handle);
  if (!handles.length) return [];
  const { data: targets } = await supabase!.from("profiles").select("name, handle").in("handle", handles);
  const found = new Set((targets || []).map((t) => t.handle));
  const fromProfiles = (targets || []).map((t) => ({ name: t.name, handle: t.handle }));
  // personas or accounts without profile handles fall back to the raw handle
  const rest = handles.filter((h) => !found.has(h)).map((h) => ({ name: userByHandle(h)?.name || h, handle: h }));
  return [...fromProfiles, ...rest];
}

export interface FollowRequest { followerId: string; name: string; handle: string; createdAt: string }
export async function getFollowRequests(myHandle: string): Promise<FollowRequest[]> {
  if (!supabaseEnabled) return [];
  const { data: rows } = await supabase!.from("follows").select("follower_id, created_at").eq("target_handle", myHandle).eq("status", "requested");
  const ids = (rows || []).map((r) => r.follower_id);
  if (!ids.length) return [];
  const { data: profs } = await supabase!.from("profiles").select("id, name, handle, email").in("id", ids);
  return (rows || []).map((r) => {
    const p = (profs || []).find((x) => x.id === r.follower_id);
    return { followerId: r.follower_id, name: p?.name || "Neighbor", handle: p?.handle || p?.email?.split("@")[0] || "user", createdAt: r.created_at };
  });
}

export async function answerFollowRequest(myHandle: string, followerId: string, approve: boolean): Promise<void> {
  if (!supabaseEnabled) return;
  if (approve) {
    await supabase!.from("follows").update({ status: "approved" }).eq("target_handle", myHandle).eq("follower_id", followerId);
  } else {
    await supabase!.from("follows").delete().eq("target_handle", myHandle).eq("follower_id", followerId);
  }
}

export async function reportsForMap(): Promise<Post[]> {
  if (supabaseEnabled) {
    const { data } = await supabase!.from("posts").select("*").eq("kind", "report").limit(300);
    return (data || []).map(rowToPost);
  }
  return [...readMine().filter((p) => p.kind === "report"), ...seeds().filter((p) => p.kind === "report")];
}

export async function addPost(post: Post, userId: string): Promise<void> {
  track(post.kind === "report" ? "report_create" : post.kind === "live" ? "live_start" : "post_create", { kind: post.kind, neighborhood: post.neighborhood });
  if (supabaseEnabled) { const { error } = await supabase!.from("posts").insert(postToRow(post, userId)); if (error) throw new Error(error.message); return; }
  const all = readMine(); all.unshift(post); localStorage.setItem(POSTS_KEY, JSON.stringify(all));
}

// Patch an existing post (e.g., end a live stream → save the replay).
export async function updatePost(id: string, patch: Partial<Post>, userId?: string): Promise<void> {
  if (supabaseEnabled && userId) {
    const row: any = {};
    if (patch.media) { row.media_url = patch.media.url; row.media_type = patch.media.type; }
    if (patch.kind) row.kind = patch.kind;
    if (patch.text !== undefined) row.text = patch.text;
    if (patch.isLive !== undefined) row.is_live = patch.isLive;
    if (patch.viewers !== undefined) row.viewers = patch.viewers;
    if (patch.durationSec !== undefined) row.duration_sec = patch.durationSec;
    await supabase!.from("posts").update(row).eq("id", id);
    return;
  }
  const all = readMine();
  const i = all.findIndex((p) => p.id === id);
  if (i >= 0) { all[i] = { ...all[i], ...patch }; localStorage.setItem(POSTS_KEY, JSON.stringify(all)); }
}

export async function getInteractions(userId?: string): Promise<Interactions> {
  if (supabaseEnabled && userId) {
    const [l, s, f, rp] = await Promise.all([
      supabase!.from("likes").select("post_id").eq("user_id", userId),
      supabase!.from("saves").select("post_id").eq("user_id", userId),
      supabase!.from("follows").select("target_handle, status").eq("follower_id", userId),
      supabase!.from("reposts").select("post_id").eq("user_id", userId),
    ]);
    const rows = f.data || [];
    return {
      likes: new Set((l.data || []).map((x) => x.post_id)),
      saves: new Set((s.data || []).map((x) => x.post_id)),
      follows: new Set(rows.filter((x) => x.status !== "requested").map((x) => x.target_handle)),
      requested: new Set(rows.filter((x) => x.status === "requested").map((x) => x.target_handle)),
      reposts: new Set((rp.data || []).map((x) => x.post_id)),
    };
  }
  return { likes: getStore(LIKES_KEY), saves: getStore(SAVES_KEY), follows: getStore(FOLLOWS_KEY), requested: new Set(), reposts: getStore(REPOSTS_KEY) };
}

async function sbToggle(table: string, match: Record<string, string>): Promise<boolean> {
  const q = supabase!.from(table).select("*", { count: "exact", head: true });
  Object.entries(match).forEach(([k, v]) => q.eq(k, v));
  const { count } = await q;
  if (count && count > 0) { let d = supabase!.from(table).delete(); Object.entries(match).forEach(([k, v]) => (d = d.eq(k, v))); await d; return false; }
  await supabase!.from(table).insert(match); return true;
}

export async function toggleLike(postId: string, userId?: string): Promise<boolean> {
  track("like", { post: postId });
  if (supabaseEnabled && userId) return sbToggle("likes", { post_id: postId, user_id: userId });
  const s = getStore(LIKES_KEY); const on = s.has(postId); on ? s.delete(postId) : s.add(postId); setStore(LIKES_KEY, s); return !on;
}
export async function toggleSave(postId: string, userId?: string): Promise<boolean> {
  if (supabaseEnabled && userId) return sbToggle("saves", { post_id: postId, user_id: userId });
  const s = getStore(SAVES_KEY); const on = s.has(postId); on ? s.delete(postId) : s.add(postId); setStore(SAVES_KEY, s); return !on;
}
// Repost = a reference to the ORIGINAL post (never a copy) — attribution
// stays with the author, and reposted reports never re-pin the map.
export async function toggleRepost(postId: string, userId?: string): Promise<boolean> {
  track("repost", { post: postId });
  if (supabaseEnabled && userId) return sbToggle("reposts", { post_id: postId, user_id: userId });
  const s = getStore(REPOSTS_KEY); const on = s.has(postId); on ? s.delete(postId) : s.add(postId); setStore(REPOSTS_KEY, s); return !on;
}
export async function repostedPosts(userId: string): Promise<Post[]> {
  const inter = await getInteractions(userId);
  return (await getFeed(userId)).filter((p) => inter.reposts.has(p.id));
}
export type FollowState = "following" | "requested" | "none";
export async function toggleFollow(handle: string, userId?: string): Promise<boolean> {
  const r = await toggleFollowState(handle, userId);
  return r !== "none";
}
// Instagram semantics: following a private account sends a REQUEST the
// owner must approve; unfollow/cancel deletes the row either way.
export async function toggleFollowState(handle: string, userId?: string): Promise<FollowState> {
  track("follow", { handle });
  if (supabaseEnabled && userId) {
    const { count } = await supabase!.from("follows").select("*", { count: "exact", head: true })
      .eq("target_handle", handle).eq("follower_id", userId);
    if (count && count > 0) {
      await supabase!.from("follows").delete().eq("target_handle", handle).eq("follower_id", userId);
      return "none";
    }
    const { data: prof } = await supabase!.from("profiles").select("is_private")
      .or(`handle.eq.${handle},email.like.${handle}@%`).limit(1);
    const isPrivate = !!prof?.[0]?.is_private;
    await supabase!.from("follows").insert({ target_handle: handle, follower_id: userId, status: isPrivate ? "requested" : "approved" });
    return isPrivate ? "requested" : "following";
  }
  const s = getStore(FOLLOWS_KEY); const on = s.has(handle); on ? s.delete(handle) : s.add(handle); setStore(FOLLOWS_KEY, s); return on ? "none" : "following";
}

export async function getComments(postId: string): Promise<Comment[]> {
  if (supabaseEnabled) {
    const { data } = await supabase!.from("comments").select("author,text,created_at").eq("post_id", postId).order("created_at", { ascending: true });
    return (data || []).map((c) => ({ author: c.author, text: c.text, ts: c.created_at }));
  }
  return readComments()[postId] || [];
}
export async function addComment(postId: string, author: string, text: string, userId?: string): Promise<void> {
  track("comment", { post: postId });
  if (supabaseEnabled && userId) { await supabase!.from("comments").insert({ post_id: postId, user_id: userId, author, text }); return; }
  const all = readComments(); all[postId] = [...(all[postId] || []), { author, text, ts: new Date().toISOString() }]; localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
}
