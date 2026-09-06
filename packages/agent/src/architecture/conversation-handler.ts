import type { DecryptedPayload, MessageEnvelope } from "@agentmom/core";

// FR7 — §9.7. BR-21: both architectures implement ONE ConversationHandler
// interface and share the transport layer unchanged. The transports in
// §9.1–9.4 are completely unaware of which is active — that is what proves
// A7.1 structurally rather than in prose.

export interface ConversationContext {
  agentId: string;
  reply: (recipientId: string, payload: DecryptedPayload, encrypted: boolean) => void;
  emit: (type: string, detail: Record<string, unknown>) => void;
}

export interface ConversationHandler {
  readonly mode: "agent-controlled" | "component-controlled";
  handleIncoming(envelope: MessageEnvelope, payload: DecryptedPayload, ctx: ConversationContext): void;
}
