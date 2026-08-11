import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

// Give a news article a real, comment-able home. News is a live layer with no
// stored post, so there's nothing for a comment/like to attach to. This route
// lazily materializes ONE post per article, keyed by a deterministic UUID of
// the URL so the same article always maps to the same post (no duplicates).
// The post itself is unowned (user_id null — it's external content, not a
// user's post); the COMMENTS on it are real, from real signed-in users, so a
// genuine discussion thread forms under each article. Service role inserts it
// (RLS blocks anon from writing an ownerless post). Only articles people engage
// with ever get stored, so the table stays lean.
export const dynamic = "force-dynamic";

const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // RFC-4122 DNS namespace
function uuid5(name: string): string {
  const ns = Buffer.from(NS.replace(/-/g, ""), "hex");
  const b = createHash("sha1").update(ns).update(name).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

export async function POST(req: NextRequest) {
  const { url, title, image, source, neighborhood } = await req.json().catch(() => ({}));
  if (!url || !title) return NextResponse.json({ error: "url + title required" }, { status: 400 });
  try {
    const { serverDb } = await import("@/lib/payments/serverdb");
    const db = serverDb(true); // service role — bypasses RLS to seat the ownerless news post
    const id = uuid5(url);
    await db.from("posts").upsert(
      {
        id, user_id: null, kind: "news", author: source || "News", handle: "news",
        color: "#0284c7", verified: true, neighborhood: neighborhood || "", lat: 0, lon: 0,
        text: title, media_url: image || null, media_type: image ? "image" : null, source: source || null,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    return NextResponse.json({ postId: id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
