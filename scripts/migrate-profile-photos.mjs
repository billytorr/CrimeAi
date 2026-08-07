#!/usr/bin/env node
//
// Backfill: move profile photos out of the `profiles.photo_url` column and
// into the `media` storage bucket.
//
// Photos used to be stored as base64 data URIs inline in the column, so every
// profile read dragged the whole image with it and large rows risked failing
// the upsert entirely. New photos already go to storage; this moves the ones
// already in the database.
//
// SAFE TO RE-RUN. It only touches rows whose photo_url starts with `data:`,
// so a second run finds nothing to do. It never deletes a photo it failed to
// upload — a row is updated only after the upload succeeds.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-profile-photos.mjs [--dry-run]
//
// The service-role key is required (it writes to storage and bypasses RLS).
// Get it from Supabase → Settings → API. Do not commit it.

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes("--dry-run");

if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
    "  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/migrate-profile-photos.mjs --dry-run");
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

/** `data:image/jpeg;base64,/9j/...` → { buffer, contentType, ext } */
function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const [, contentType, isB64, payload] = m;
  if (!contentType.startsWith("image/")) return null;
  const buffer = isB64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  if (!buffer.length) return null;
  const ext = (contentType.split("/")[1] || "jpg").replace("jpeg", "jpg");
  return { buffer, contentType, ext };
}

const kb = (n) => `${(n / 1024).toFixed(0)}kb`;

async function main() {
  console.log(DRY ? "DRY RUN — nothing will be written\n" : "");

  const { data: rows, error } = await db
    .from("profiles")
    .select("id, handle, photo_url")
    .like("photo_url", "data:%");

  if (error) { console.error("Query failed:", error.message); process.exit(1); }
  if (!rows?.length) { console.log("Nothing to migrate — no inline photos found."); return; }

  const totalBytes = rows.reduce((s, r) => s + (r.photo_url?.length || 0), 0);
  console.log(`${rows.length} profile(s) with inline photos, ${kb(totalBytes)} of column data\n`);

  let migrated = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const label = row.handle ? `@${row.handle}` : row.id.slice(0, 8);
    const parsed = parseDataUrl(row.photo_url);
    if (!parsed) { console.log(`  skip   ${label} — not a readable image`); skipped++; continue; }

    if (DRY) { console.log(`  would  ${label} — ${kb(parsed.buffer.length)} ${parsed.contentType}`); migrated++; continue; }

    const path = `${row.id}/avatar-${Date.now()}.${parsed.ext}`;
    const { error: upErr } = await db.storage.from("media")
      .upload(path, parsed.buffer, { contentType: parsed.contentType, upsert: false });
    if (upErr) { console.error(`  FAIL   ${label} — upload: ${upErr.message}`); failed++; continue; }

    const { data: pub } = db.storage.from("media").getPublicUrl(path);
    if (!pub?.publicUrl) { console.error(`  FAIL   ${label} — no public URL`); failed++; continue; }

    // Only now is it safe to drop the inline copy.
    const { error: updErr } = await db.from("profiles").update({ photo_url: pub.publicUrl }).eq("id", row.id);
    if (updErr) { console.error(`  FAIL   ${label} — update: ${updErr.message}`); failed++; continue; }

    console.log(`  ok     ${label} — ${kb(parsed.buffer.length)} → storage`);
    migrated++;
  }

  console.log(`\n${DRY ? "would migrate" : "migrated"} ${migrated}, skipped ${skipped}, failed ${failed}`);
  if (failed) {
    console.log("Failed rows kept their inline photo — nothing was lost. Re-run to retry them.");
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
