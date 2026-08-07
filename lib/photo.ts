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

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

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

    const compressed = await dataUrlToBlob(await resizeImage(blob));
    const file = new File([compressed], "avatar.jpg", { type: "image/jpeg" });
    const up = await uploadMedia(file, userId);
    return up.url || url;
  } catch {
    return url;
  }
}
