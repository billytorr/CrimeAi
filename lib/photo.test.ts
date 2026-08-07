import { describe, it, expect, vi, beforeEach } from "vitest";

// importRemotePhoto runs inside signup. Every failure mode has to degrade to
// "keep the provider URL" rather than "lose the photo" or "throw" — a broken
// avatar copy must never be what stops someone finishing onboarding.

const uploadMedia = vi.fn();
let enabled = true;
vi.mock("@/lib/supabase", () => ({
  get supabaseEnabled() { return enabled; },
  uploadMedia: (...a: any[]) => uploadMedia(...a),
}));

const GOOGLE = "https://lh3.googleusercontent.com/a/abc123";

describe("importRemotePhoto", () => {
  beforeEach(() => {
    enabled = true;
    uploadMedia.mockReset();
    vi.unstubAllGlobals();
  });

  it("leaves a data URI alone — it is already ours", async () => {
    const { importRemotePhoto } = await import("@/lib/photo");
    const dataUri = "data:image/jpeg;base64,/9j/4AAQ";
    expect(await importRemotePhoto(dataUri, "u1")).toBe(dataUri);
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it("leaves an empty photo alone", async () => {
    const { importRemotePhoto } = await import("@/lib/photo");
    expect(await importRemotePhoto("", "u1")).toBe("");
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it("keeps the provider URL when storage isn't configured", async () => {
    enabled = false;
    const { importRemotePhoto } = await import("@/lib/photo");
    expect(await importRemotePhoto(GOOGLE, "u1")).toBe(GOOGLE);
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it("keeps the provider URL when the fetch is refused (CORS / offline)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("CORS")));
    const { importRemotePhoto } = await import("@/lib/photo");
    expect(await importRemotePhoto(GOOGLE, "u1")).toBe(GOOGLE);
  });

  it("keeps the provider URL on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { importRemotePhoto } = await import("@/lib/photo");
    expect(await importRemotePhoto(GOOGLE, "u1")).toBe(GOOGLE);
  });

  it("keeps the provider URL when the response isn't an image", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, blob: async () => ({ type: "text/html" }),
    }));
    const { importRemotePhoto } = await import("@/lib/photo");
    expect(await importRemotePhoto(GOOGLE, "u1")).toBe(GOOGLE);
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it("keeps the provider URL when the upload itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, blob: async () => ({ type: "image/jpeg" }),
    }));
    uploadMedia.mockRejectedValue(new Error("bucket unavailable"));
    const { importRemotePhoto } = await import("@/lib/photo");
    expect(await importRemotePhoto(GOOGLE, "u1")).toBe(GOOGLE);
  });

  it("never throws — onboarding must finish regardless", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => { throw new Error("boom"); }));
    const { importRemotePhoto } = await import("@/lib/photo");
    await expect(importRemotePhoto(GOOGLE, "u1")).resolves.toBe(GOOGLE);
  });
});
