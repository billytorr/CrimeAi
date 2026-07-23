// ── Neighbor messaging (DMs) ─────────────────────────────────
// Lets neighbors message back and forth to coordinate on safety.
// localStorage-backed for the zero-config demo (seeded neighbor
// threads + your replies persist + a contextual reply so it feels
// two-way). The Supabase `messages` table (schema.sql) is the
// production path for real-time cross-user DMs.
import { LOCAL_USERS } from "./social";

export interface DM { id: string; fromMe: boolean; text: string; ts: string }
export interface Conversation { handle: string; name: string; color: string; verified: boolean; last: string; ts: string; unread: boolean }

const KEY = "pscc_dms";       // { [handle]: DM[] }
const READ = "pscc_dm_read";  // { [handle]: iso }
const userOf = (h: string) => LOCAL_USERS.find((u) => u.handle === h);
const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

// Seeded incoming messages — crime-coordination flavored.
const SEED: Record<string, { text: string; mins: number }[]> = {
  brickellwatch: [
    { text: "Thanks for flagging the car break-in attempt on 2nd Ave — staying alert tonight.", mins: 26 },
    { text: "If you spot them again, drop a report and tag the block. The whole watch gets pinged instantly.", mins: 19 },
  ],
  aisha305: [{ text: "Hey neighbor! We're starting an Edgewater–Brickell watch group. Want in?", mins: 88 }],
  sobeneighbors: [{ text: "Extra MDPD patrols on Ocean Dr this weekend — spread the word to your block.", mins: 200 }],
  gablesalert: [{ text: "Porch-pirate season is here. I can share our camera-placement tips if useful.", mins: 320 }],
};
// One contextual reply so the thread feels two-way in the demo.
const REPLY: Record<string, string> = {
  brickellwatch: "Appreciate you. I'll keep eyes on the block and report anything.",
  aisha305: "Count me in — add me to the watch group. Thanks for organizing!",
  sobeneighbors: "Good looking out. I'll let my neighbors know.",
  gablesalert: "Yes please, send the tips. Trying to lock things down before the holidays.",
};

function readAll(): Record<string, DM[]> { if (typeof window === "undefined") return {}; try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
function writeAll(o: Record<string, DM[]>) { localStorage.setItem(KEY, JSON.stringify(o)); }
function seedThread(handle: string): DM[] {
  return (SEED[handle] || []).map((m, i) => ({ id: `seed-${handle}-${i}`, fromMe: false, text: m.text, ts: minsAgo(m.mins) }));
}

export function getThread(handle: string): DM[] {
  const all = readAll();
  if (!all[handle]) { all[handle] = seedThread(handle); writeAll(all); }
  return all[handle];
}

export function sendDM(handle: string, text: string): DM[] {
  const all = readAll();
  const t = all[handle]?.length ? all[handle] : seedThread(handle);
  t.push({ id: `me-${Date.now()}`, fromMe: true, text, ts: new Date().toISOString() });
  all[handle] = t; writeAll(all);
  return t;
}

// Returns a one-time contextual reply (caller appends after a short delay).
export function pendingReply(handle: string): DM | null {
  const t = getThread(handle);
  if (t.some((m) => m.id.startsWith("rep-"))) return null; // already replied once
  const r = REPLY[handle];
  if (!r) return null;
  return { id: `rep-${Date.now()}`, fromMe: false, text: r, ts: new Date().toISOString() };
}
export function appendReply(handle: string, dm: DM): DM[] {
  const all = readAll();
  const t = all[handle] || seedThread(handle);
  t.push(dm); all[handle] = t; writeAll(all);
  return t;
}

export function markRead(handle: string) {
  if (typeof window === "undefined") return;
  const r = JSON.parse(localStorage.getItem(READ) || "{}");
  r[handle] = new Date().toISOString();
  localStorage.setItem(READ, JSON.stringify(r));
}

export function getConversations(follows: Set<string>): Conversation[] {
  const all = readAll();
  const read = (() => { try { return JSON.parse(localStorage.getItem(READ) || "{}"); } catch { return {}; } })();
  const handles = new Set<string>([...Object.keys(all), ...Object.keys(SEED), ...follows]);
  const list: Conversation[] = [];
  for (const h of handles) {
    const u = userOf(h);
    if (!u) continue;
    const thread = all[h]?.length ? all[h] : seedThread(h);
    const lastM = thread[thread.length - 1];
    const last = lastM ? lastM.text : "Start a conversation";
    const ts = lastM ? lastM.ts : minsAgo(9999);
    const unread = !!lastM && !lastM.fromMe && (!read[h] || new Date(read[h]) < new Date(lastM.ts));
    list.push({ handle: h, name: u.name, color: u.color, verified: u.verified, last, ts, unread });
  }
  return list.sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
}

export function unreadCount(follows: Set<string>): number {
  return getConversations(follows).filter((c) => c.unread).length;
}
