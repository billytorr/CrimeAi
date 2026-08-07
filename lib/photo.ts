"use client";

// Profile photo handling.
//
// resizeImage was previously inline in Onboarding. It lives here so the SSO
// avatar import runs through the EXACT same downscale/compress path as a
// user-picked photo — a second, slightly-different image pipeline is how the
// two drift apart.

import { supabaseEnabled, uploadMedia } from "@/lib/supabase";

/**
 * Downscale + compress to a square-ish JPEG data URL.
 *
 * Raw multi-MB phone photos bloat or fail the profile upsert — that was the
 * original "photo didn't save" bug. Accepts any Blob, so it works for a
 * picked File and for a fetched remote image alike.
 */
export function resizeImage(file: Blob, max = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Decode a data URL without fetch().
 *
 * `fetch(dataUrl)` also works, but it makes this untestable — any test that
 * stubs global fetch (to simulate a CORS failure, say) breaks the decode too.
 * Manual decode keeps the two concerns independent.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error("not a data URL");
  const [, contentType, isB64, payload] = m;
  const raw = isB64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

/**
 * Put an already-resized data URL into our storage bucket.
 *
 * Split out from storeProfilePhoto so the upload/fallback behaviour is
 * testable — resizeImage needs FileReader, Image and canvas, so anything
 * calling it can only run in a browser.
 *
 * FALLS BACK to the data URL when storage is unavailable (demo mode) or the
 * upload fails. Still smaller than the raw file, and the user keeps their
 * picture rather than losing it to a bad network.
 */
export async function uploadDataUrl(dataUrl: string, userId: string): Promise<string> {
  if (!supabaseEnabled || !userId || !dataUrl.startsWith("data:")) return dataUrl;
  try {
    const blob = dataUrlToBlob(dataUrl);
    const up = await uploadMedia(new File([blob], "avatar.jpg", { type: blob.type || "image/jpeg" }), userId);
    return up.url || dataUrl;
  } catch {
    return dataUrl;
  }
}

/**
 * THE single way a profile photo is saved. Resize, upload, return the URL.
 *
 * Every picker must go through this. Before it existed there were three:
 * Onboarding resized to a data URI, while EditProfile and MeScreen stored
 * the RAW file as base64 with no resize at all — a multi-MB phone photo
 * became a multi-MB string in the profiles row, re-sent on every read. That
 * is the "photo didn't save" bug: fixed in one picker, left in the other two.
 */
export async function storeProfilePhoto(file: Blob, userId: string): Promise<string> {
  return uploadDataUrl(await resizeImage(file), userId);  // resize even on the fallback path
}

/**
 * Copy a third-party avatar (Google / Apple) into our own storage bucket.
 *
 * Keeping the provider's URL means the picture 404s if they rotate it or the
 * user deletes that account — a profile photo that can vanish on someone
 * else's schedule isn't ours. So: fetch it once, compress it like any other
 * profile photo, and store the copy.
 *
 * FAILS SOFT to the original URL. A CORS refusal or a flaky network must
 * never cost the user their picture or block onboarding — a possibly-stale
 * image beats no image.
 *
 * Returns unchanged for anything that isn't a remote http(s) URL (a data URI
 * is already ours), so this is safe to call unconditionally.
 */
export async function importRemotePhoto(url: string, userId: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  if (!supabaseEnabled) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return url;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return url;

    const stored = await uploadDataUrl(await resizeImage(blob), userId);
    // uploadDataUrl hands back the data URL if the upload failed; prefer the
    // provider URL over embedding a copy we meant to store properly.
    return stored.startsWith("data:") ? url : stored;
  } catch {
    return url;
  }
}
