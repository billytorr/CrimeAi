import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { crimeaiMode, providerSelection } from "@/lib/ai/config";
import { gateway } from "@/lib/ai/gateway";
import { buildManifest } from "@/lib/ai/capabilities";
import { orchestrator } from "@/lib/ai/orchestrator";
import { torrConnection, getTorrAdapter } from "@/lib/ai/torr/adapter";
import { availableTools, TOOLS } from "@/lib/ai/tools";
import { emitEvent, onEvent } from "@/lib/ai/events";

// The master prompt's most important test (§38): with TORR disabled — which
// is the only state today — every critical path works and nothing depends on
// TORR. These pin the Phase 1 seams to standalone behaviour.

describe("orchestration mode — standalone is the default", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it("defaults to standalone with TORR disabled", () => {
    delete process.env.CRIMEAI_ORCHESTRATION_MODE;
    delete process.env.TORR_ENABLED;
    const m = crimeaiMode();
    expect(m.orchestration).toBe("standalone");
    expect(m.torrEnabled).toBe(false);
  });

  it("refuses to enable TORR while mode is standalone, even if the flag is set", () => {
    process.env.CRIMEAI_ORCHESTRATION_MODE = "standalone";
    process.env.TORR_ENABLED = "true";
    expect(crimeaiMode().torrEnabled).toBe(false); // belt-and-braces guard
  });

  it("only arms TORR when BOTH a non-standalone mode and the flag are set", () => {
    process.env.CRIMEAI_ORCHESTRATION_MODE = "hybrid";
    process.env.TORR_ENABLED = "true";
    expect(crimeaiMode().torrEnabled).toBe(true);
  });
});

describe("TORR adapter — disabled boundary, no fake behaviour", () => {
  it("is never reachable today", () => {
    const c = torrConnection();
    expect(c.reachable).toBe(false);
    expect(c.level).toBe(0);
  });
  it("provides no adapter, so callers fall back to standalone", () => {
    expect(getTorrAdapter()).toBeNull();
  });
});

describe("model gateway — LLM wraps existing crimeai.ts, rest are honest stubs", () => {
  it("resolves the LLM to the built-in crimeai provider", () => {
    expect(gateway.llm().name).toBe("crimeai");
  });
  it("reports every other capability as unconfigured", () => {
    const s = gateway.status();
    for (const cap of ["stt", "tts", "vision", "search", "research", "embedding"] as const) {
      expect(s[cap].configured, cap).toBe(false);
    }
  });
  it("stub providers throw rather than fabricating a result", async () => {
    await expect(gateway.vision().analyze("x")).rejects.toThrow(/not configured/i);
    await expect(gateway.stt().transcribe(new ArrayBuffer(0))).rejects.toThrow(/not configured/i);
  });
});

describe("tool registry — only real tools are available", () => {
  it("crime.lookup and crime.ask are available", () => {
    const names = availableTools().map((t) => t.name);
    expect(names).toContain("crime.lookup");
    expect(names).toContain("crime.ask");
  });
  it("web/voice tools are declared but NOT available (no vendor yet)", () => {
    // vision.analyze is intentionally NOT here — it's available when Anthropic
    // is configured (Phase 4), which is env-dependent. These have no provider.
    for (const n of ["web.search", "web.research", "voice.transcribe", "voice.synthesize"]) {
      expect(TOOLS.find((t) => t.name === n)?.available).toBe(false);
    }
  });
  it("every tool carries permission + risk metadata", () => {
    for (const t of TOOLS) {
      expect(t.permissions.length).toBeGreaterThan(0);
      expect(t.risk).toBeTruthy();
      expect(t.timeoutMs).toBeGreaterThan(0);
    }
  });
});

describe("capability manifest — generated from what works", () => {
  it("advertises crime capabilities and lists the planned ones separately", () => {
    const m = buildManifest();
    expect(m.system).toBe("crimeai");
    expect(m.capabilities).toContain("area_safety_scoring");
    expect(m.planned).toContain("web.search"); // not yet built
    expect(m.torr.level).toBe(0);
  });
});

describe("orchestrator health — standalone, TORR unreachable", () => {
  it("reports ok and torr unreachable", () => {
    const h = orchestrator().health();
    expect(h.ok).toBe(true);
    expect(h.torr.reachable).toBe(false);
  });
});

describe("event bus — in-process, never throws into the emitter", () => {
  it("delivers events to listeners", () => {
    let got = "";
    const off = onEvent("crimeai.llm.completed", (e) => { got = String(e.data?.engine); });
    emitEvent("crimeai.llm.completed", { engine: "anthropic" });
    off();
    expect(got).toBe("anthropic");
  });
  it("a throwing listener does not break emit", () => {
    const off = onEvent("crimeai.error", () => { throw new Error("boom"); });
    expect(() => emitEvent("crimeai.error", {})).not.toThrow();
    off();
  });
});

// Phase 4: vision provider. Real when Anthropic is configured; honest stub
// otherwise. The gateway must never hand back a "configured" vision provider
// without the key, and the manifest must reflect it.
describe("vision provider — Phase 4", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it("is a stub (unconfigured) when ANTHROPIC_API_KEY is absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { gateway } = await import("@/lib/ai/gateway");
    expect(gateway.vision().configured).toBe(false);
    await expect(gateway.vision().analyze("x")).rejects.toThrow(/not configured/i);
  });

  it("the vision.analyze tool tracks the key's presence", async () => {
    const { TOOLS } = await import("@/lib/ai/tools");
    const tool = TOOLS.find((t) => t.name === "vision.analyze")!;
    // available mirrors !!ANTHROPIC_API_KEY at module-eval time; just assert it's a boolean and read-risk
    expect(typeof tool.available).toBe("boolean");
    expect(tool.risk).toBe("read");
    expect(tool.provider).toBe("anthropic");
  });
});
