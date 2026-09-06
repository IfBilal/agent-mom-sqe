import type { TransportMode } from "./message.js";

// WebSocket event contract — §10. Every drop and failure mode gets its OWN
// event type rather than a generic error, so Table B's Evidence column points
// at one named event.
export type LiveEventType =
  | "AGENT_SPAWNED"
  | "AGENT_KILLED"
  | "AGENT_STATUS"
  | "MESSAGE_SENT"
  | "MESSAGE_RECEIVED"
  | "MESSAGE_DROPPED_MEMBERSHIP"
  | "MESSAGE_DROPPED_TTL_EXPIRED"
  | "MESSAGE_DROPPED_SIMULATED"
  | "MESSAGE_MALFORMED"
  | "PROTOCOL_VIOLATION"
  | "DECRYPTION_FAILED"
  | "BROADCAST_PERMISSION_DENIED"
  | "SEQUENCE_ANOMALY"
  | "ARCHITECTURE_SWITCHED"
  | "GROUP_KEY_GRANTED"
  | "GROUP_KEY_DENIED";

export interface LiveEvent {
  type: LiveEventType;
  payload: Record<string, unknown>;
  ts: number;
}

export interface MessageLogEntry {
  envelopeId: string;
  mode: TransportMode;
  senderId: string;
  recipientId?: string;
  groupAddress?: string;
  addressUsed?: string;
  encrypted: boolean;
  event: LiveEventType;
  detail?: string;
  ts: number;
}

export interface ApiError {
  error: { code: string; message: string };
}
