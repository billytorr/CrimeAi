// CrimeAI Agent contract (master-prompt §20).
//
// An agent is a named unit of domain work. It requests models/tools/memory
// through CrimeAI SERVICES (the gateway/orchestrator) and never touches
// infrastructure directly — which is what makes TORR delegation possible later
// without agents reaching into the DB or vendors themselves.

export interface AgentTask {
  /** idempotency + tracing (master-prompt §34) */
  taskId?: string;
  input: string;
  context?: Record<string, unknown>;
}

export interface AgentResult {
  agentId: string;
  output: string;
  meta?: Record<string, unknown>;
}

export interface CrimeAIAgent {
  id: string;
  name: string;
  description: string;
  /** tool names from the registry this agent uses */
  capabilities: string[];
  /** available only when its underlying tools/providers are configured */
  available(): boolean;
  execute(task: AgentTask): Promise<AgentResult>;
}
