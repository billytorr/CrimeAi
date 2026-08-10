// CrimeAI event bus — lightweight, in-process.
//
// Master prompt §18: "Do not introduce Kafka or another major dependency."
// This is a typed EventEmitter-style pub/sub that runs inside the request.
// It exists so subsystems emit `crimeai.*` events now, and a later TORR Event
// Bridge can subscribe without those emitters changing.
//
// Non-durable by design — this is not the push pipeline (that's pg_net + DB).
// It's for telemetry/observability hooks, and it never throws into a caller:
// a listener that fails must not break the operation that emitted the event.

export type CrimeAIEventName =
  | "crimeai.request.received"
  | "crimeai.llm.completed"
  | "crimeai.tool.invoked"
  | "crimeai.security.denied"
  | "crimeai.error";

export interface CrimeAIEvent {
  name: CrimeAIEventName;
  at: number;
  requestId?: string;
  data?: Record<string, unknown>;
}

type Listener = (e: CrimeAIEvent) => void;

const listeners = new Map<CrimeAIEventName | "*", Set<Listener>>();

export function onEvent(name: CrimeAIEventName | "*", fn: Listener): () => void {
  const set = listeners.get(name) ?? new Set<Listener>();
  set.add(fn);
  listeners.set(name, set);
  return () => set.delete(fn);
}

export function emitEvent(name: CrimeAIEventName, data?: Record<string, unknown>, requestId?: string): void {
  const e: CrimeAIEvent = { name, at: Date.now(), requestId, data };
  for (const key of [name, "*"] as const) {
    for (const fn of listeners.get(key) ?? []) {
      try { fn(e); } catch { /* a listener failure never touches the emitter */ }
    }
  }
}
