import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

// Give a news article a real, comment-able home. News is a live layer with no
// stored post, so there's nothing for a comment/like to attach to. This route
// lazily materializes ONE real post per article — owned by the @crimeai
// official account, keyed by a deterministic UUID of the URL so the same
// article always maps to the same post (no duplicates). Comments and likes then
// use the normal, real-account machinery. Only articles people actually engage
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

let officialId: string | null = null;

export async function POST(req: NextRequest) {
  const { url, title, image, source, neighborhood } = await req.json().catch(() => ({}));
  if (!url || !title) return NextResponse.json({ error: "url + title required" }, { status: 400 });
  try {
    const { serverDb } = await import("@/lib/payments/serverdb");
    const db = serverDb(true); // service role — bypasses RLS to own the post as @crimeai
    if (!officialId) {
      const { data } = await db.from("profiles").select("id, handle").eq("is_official", true).limit(1).maybeSingle();
      officialId = data?.id || null;
    }
    if (!officialId) return NextResponse.json({ error: "no official account" }, { status: 503 });

    const id = uuid5(url);
    await db.from("posts").upsert(
      {
        id, user_id: officialId, kind: "news", author: source || "News", handle: "crimeai",
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
