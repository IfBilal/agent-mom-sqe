import type { LiveEvent, LiveEventType } from "@agentmom/core";

export type Emit = (event: LiveEvent) => void;

export function makeEvent(
  type: LiveEventType,
  payload: Record<string, unknown>,
): LiveEvent {
  return { type, payload, ts: Date.now() };
}

/** Collects events in-memory — used by component tests instead of the IPC channel. */
export function collector(): { emit: Emit; events: LiveEvent[] } {
  const events: LiveEvent[] = [];
  return { emit: (e) => events.push(e), events };
}
