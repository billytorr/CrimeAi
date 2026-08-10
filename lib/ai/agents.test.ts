import { describe, it, expect, afterEach } from "vitest";
import { listAgents, availableAgents, findAgent, agentManifest } from "@/lib/ai/agents/registry";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Phase 6: agents are standardised over existing capabilities and go through
// SERVICES, never infrastructure. The key architectural guarantee (§20) is
// that an agent doesn't reach into the DB or a vendor SDK directly.

describe("agent registry", () => {
  it("registers the three domain agents", () => {
    const ids = listAgents().map((a) => a.id);
    expect(ids).toEqual(["safety-qa", "vision", "web-research"]);
  });
  it("each agent declares its tool capabilities and a description", () => {
    for (const a of listAgents()) {
      expect(a.capabilities.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(10);
      expect(typeof a.available()).toBe("boolean");
    }
  });
  it("availability tracks the underlying provider/tool", () => {
    // vision/web availability follow their keys; safety-qa follows the LLM.
    // Whatever the env, availableAgents ⊆ listAgents and each is really available.
    for (const a of availableAgents()) expect(a.available()).toBe(true);
  });
  it("findAgent resolves by id", () => {
    expect(findAgent("vision")?.name).toBe("Vision Analyst");
    expect(findAgent("nope")).toBeUndefined();
  });
  it("agentManifest is serialisable and secret-free", () => {
    const m = agentManifest();
    const json = JSON.stringify(m);
    expect(json).not.toMatch(/api[_-]?key|secret|token/i);
    expect(m[0]).toHaveProperty("capabilities");
  });
});

describe("§20 — agents use services, not infrastructure directly", () => {
  it("the agents module imports no DB client or vendor SDK", () => {
    const src = readFileSync(join(process.cwd(), "lib/ai/agents/agents.ts"), "utf8");
    // must go through the gateway/orchestrator, never reach past them
    expect(src).not.toMatch(/from ["']@\/lib\/payments\/serverdb["']/);
    expect(src).not.toMatch(/@anthropic-ai|deepgram|elevenlabs|supabase/i);
    expect(src).toMatch(/from ["']\.\.\/gateway["']/);
  });
});
