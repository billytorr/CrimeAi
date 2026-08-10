// TORR AI adapter boundary — the ONLY place TORR may ever connect (master
// prompt §8). Today it is a disabled stub. There is NO fake TORR behaviour
// and no live client; the prompt is explicit that TORR is not production-ready
// and CrimeAI must never depend on it.
//
// This file exists so that:
//   1. CrimeAI business logic has a single, named place to import a TORR
//      client from later — never a hard-coded TORR dependency scattered around.
//   2. The failover contract (§28) is expressed now: if TORR is unavailable,
//      isConnected() is false and callers fall back to standalone.
//
// When a real TORR endpoint exists, a TorrClient is implemented HERE and the
// orchestrator's hybrid/torr path selects it. Nothing else changes.

import { crimeaiMode } from "../config";

export interface TorrConnection {
  enabled: boolean;
  reachable: boolean;
  level: number; // §42 maturity: 0 disconnected … 7 GOS. Always 0 today.
}

/**
 * TORR is never connected today. Even with TORR_ENABLED=true and a non-
 * standalone mode, there is no client to reach, so this reports disconnected
 * and CrimeAI stays fully standalone — the mandatory emergency-standalone
 * behaviour from §43.
 */
export function torrConnection(): TorrConnection {
  const mode = crimeaiMode();
  return { enabled: mode.torrEnabled, reachable: false, level: 0 };
}

/** The forward-looking contract. No implementation ships until a later phase. */
export interface TorrAdapter {
  authenticate(): Promise<boolean>;
  advertiseCapabilities(): Promise<void>;
  health(): Promise<{ ok: boolean }>;
}

/** No adapter yet — callers must treat null as "run standalone". */
export function getTorrAdapter(): TorrAdapter | null {
  return null;
}
