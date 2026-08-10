import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Real providers, tested with a mocked fetch: request shaping, response
// parsing, and — the guarantee that matters for a dormant-adapter — that each
// throws (never fabricates) when its key is absent.

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); });

describe("Deepgram STT", () => {
  it("is unconfigured and rejects without a key", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    const { deepgramSTT } = await import("@/lib/ai/voice/deepgram-stt");
    const p = deepgramSTT();
    expect(p.configured).toBe(false);
    await expect(p.transcribe(new Blob([]))).rejects.toThrow(/not configured/i);
  });
  it("parses the transcript and sends the auth header", async () => {
    process.env.DEEPGRAM_API_KEY = "dg_test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ results: { channels: [{ alternatives: [{ transcript: "hello there" }] }] }, metadata: { duration: 2.1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { deepgramSTT } = await import("@/lib/ai/voice/deepgram-stt");
    const r = await deepgramSTT().transcribe(new Blob(["x"], { type: "audio/webm" }));
    expect(r.text).toBe("hello there");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Token dg_test");
  });
});

describe("ElevenLabs TTS", () => {
  it("needs BOTH key and voice id to be configured", async () => {
    process.env.ELEVENLABS_API_KEY = "el_test";
    delete process.env.ELEVENLABS_VOICE_ID;
    const { elevenlabsTTS } = await import("@/lib/ai/voice/elevenlabs-tts");
    expect(elevenlabsTTS().configured).toBe(false);
    await expect(elevenlabsTTS().synthesize("hi")).rejects.toThrow(/not configured/i);
  });
  it("returns audio and clips very long text", async () => {
    process.env.ELEVENLABS_API_KEY = "el_test";
    process.env.ELEVENLABS_VOICE_ID = "voice123";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal("fetch", fetchMock);
    const { elevenlabsTTS } = await import("@/lib/ai/voice/elevenlabs-tts");
    const r = await elevenlabsTTS().synthesize("x".repeat(5000));
    expect(r.contentType).toBe("audio/mpeg");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text.length).toBe(2000); // clipped
    expect(fetchMock.mock.calls[0][0]).toContain("/voice123"); // routed to the voice
  });
});

describe("Brave search", () => {
  it("rejects without a key", async () => {
    delete process.env.BRAVE_API_KEY;
    const { braveSearch } = await import("@/lib/ai/web/brave-search");
    await expect(braveSearch().search("x")).rejects.toThrow(/not configured/i);
  });
  it("maps results to {title,url,snippet}", async () => {
    process.env.BRAVE_API_KEY = "br_test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ web: { results: [{ title: "T", url: "https://x", description: "D" }] } }),
    }));
    const { braveSearch } = await import("@/lib/ai/web/brave-search");
    const hits = await braveSearch().search("miami crime", { limit: 3 });
    expect(hits[0]).toEqual({ title: "T", url: "https://x", snippet: "D" });
  });
});

describe("Tavily research", () => {
  it("rejects without a key", async () => {
    delete process.env.TAVILY_API_KEY;
    const { tavilyResearch } = await import("@/lib/ai/web/tavily-research");
    await expect(tavilyResearch().research("x")).rejects.toThrow(/not configured/i);
  });
  it("returns the answer summary and sources", async () => {
    process.env.TAVILY_API_KEY = "tv_test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ answer: "the summary", results: [{ title: "S", url: "https://s", content: "c" }] }),
    }));
    const { tavilyResearch } = await import("@/lib/ai/web/tavily-research");
    const r = await tavilyResearch().research("q");
    expect(r.summary).toBe("the summary");
    expect(r.sources[0].url).toBe("https://s");
  });
});
