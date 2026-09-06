// Canonical message envelope — §8 of the implementation plan.
// One envelope for all three transports. Encryption wraps `payload` only;
// metadata always travels in clear so a receiver can decide how to handle the
// body before parsing it.

export type TransportMode = "unicast" | "multicast" | "broadcast";

export interface MessageEnvelope {
  id: string; // uuid v4, generated at send time
  mode: TransportMode;
  senderId: string;
  recipientId?: string; // required for unicast — BR-01 (3.2.1.3)
  groupAddress?: string; // required for multicast — BR-07, BR-10 (3.2.2.8)
  sequenceNumber: number; // per (senderId, recipientId) — BR-02/BR-03. NOT global.
  timestampSentMs: number;
  ttl?: number; // multicast only — BR-08, BR-09 (3.2.2.7)
  encrypted: boolean; // BR-14 (3.2.4.3) — sender's per-message choice
  payload: string; // plaintext JSON, or base64 AES-GCM ciphertext when encrypted
  iv?: string; // base64; present iff encrypted === true
  authTag?: string; // base64; present iff encrypted === true
}

export type PayloadKind =
  | "chat"
  | "ping"
  | "join-notify"
  | "leave-notify"
  | "task-bid"
  | "system";

export interface DecryptedPayload {
  kind: PayloadKind;
  body: Record<string, unknown>;
}
