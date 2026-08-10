// The real agents — thin standardisations over existing capabilities. Each
// goes through the gateway/orchestrator (services), never infra directly.

import type { CrimeAIAgent, AgentTask, AgentResult } from "./types";
import { gateway } from "../gateway";
import { orchestrator } from "../orchestrator";
import { findTool } from "../tools";

const toolAvailable = (name: string) => !!findTool(name)?.available;

// Grounded public-safety Q&A — the assistant's core. Grounding context is
// supplied by the caller (the ask route builds it); the agent just reasons.
export const safetyQaAgent: CrimeAIAgent = {
  id: "safety-qa",
  name: "Safety Q&A",
  description: "Answers public-safety questions grounded in local crime data.",
  capabilities: ["crime.ask"],
  available: () => toolAvailable("crime.ask") && gateway.llm().configured,
  async execute(task: AgentTask): Promise<AgentResult> {
    const { answer, engine } = await orchestrator().ask({
      question: task.input,
      context: String(task.context?.grounding || ""),
    }, task.taskId);
    return { agentId: this.id, output: answer, meta: { engine } };
  },
};

// Image/document interpretation.
export const visionAgent: CrimeAIAgent = {
  id: "vision",
  name: "Vision Analyst",
  description: "Interprets an uploaded image or document for public-safety relevance.",
  capabilities: ["vision.analyze"],
  available: () => gateway.vision().configured,
  async execute(task: AgentTask): Promise<AgentResult> {
    const image = String(task.context?.image || "");
    const { description } = await gateway.vision().analyze(image, task.input);
    return { agentId: this.id, output: description };
  },
};

// Web research (Tavily's own summary + sources — no raw pages into our model).
export const webResearchAgent: CrimeAIAgent = {
  id: "web-research",
  name: "Web Researcher",
  description: "Researches current information beyond local data, with sources.",
  capabilities: ["web.research"],
  available: () => gateway.research().configured,
  async execute(task: AgentTask): Promise<AgentResult> {
    const { summary, sources } = await gateway.research().research(task.input);
    return { agentId: this.id, output: summary, meta: { sources } };
  },
};

export const ALL_AGENTS: CrimeAIAgent[] = [safetyQaAgent, visionAgent, webResearchAgent];
