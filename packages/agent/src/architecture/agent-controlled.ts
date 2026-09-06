import type { DecryptedPayload, MessageEnvelope } from "@agentmom/core";
import type { ConversationContext, ConversationHandler } from "./conversation-handler.js";

// agent-controlled — one handleIncoming on the agent, containing the conversation
// state machine DIRECTLY. The agent controls the conversation.
export class AgentControlledHandler implements ConversationHandler {
  readonly mode = "agent-controlled" as const;

  handleIncoming(
    envelope: MessageEnvelope,
    payload: DecryptedPayload,
    ctx: ConversationContext,
  ): void {
    switch (payload.kind) {
      case "ping":
        if (envelope.senderId !== ctx.agentId && envelope.recipientId) {
          ctx.reply(envelope.senderId, { kind: "system", body: { pong: true } }, envelope.encrypted);
        }
        ctx.emit("CONVERSATION_HANDLED", { by: "agent-controlled", kind: "ping" });
        break;
      case "task-bid":
        ctx.emit("CONVERSATION_HANDLED", { by: "agent-controlled", kind: "task-bid", bid: payload.body });
        break;
      case "join-notify":
      case "leave-notify":
        ctx.emit("CONVERSATION_HANDLED", { by: "agent-controlled", kind: payload.kind });
        break;
      default:
        ctx.emit("CONVERSATION_HANDLED", { by: "agent-controlled", kind: payload.kind });
    }
  }
}
