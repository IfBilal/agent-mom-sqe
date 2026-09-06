import type { DecryptedPayload, MessageEnvelope, PayloadKind } from "@agentmom/core";
import type { ConversationContext, ConversationHandler } from "./conversation-handler.js";

// component-controlled — a ConversationRouter dispatching DecryptedPayload.kind
// to pluggable ConversationComponent instances. The agent's components control
// the conversation.

export interface ConversationComponent {
  readonly kinds: PayloadKind[];
  handle(envelope: MessageEnvelope, payload: DecryptedPayload, ctx: ConversationContext): void;
}

class PingComponent implements ConversationComponent {
  readonly kinds: PayloadKind[] = ["ping"];
  handle(envelope: MessageEnvelope, _p: DecryptedPayload, ctx: ConversationContext): void {
    if (envelope.senderId !== ctx.agentId) {
      ctx.reply(envelope.senderId, { kind: "system", body: { pong: true } }, envelope.encrypted);
    }
    ctx.emit("CONVERSATION_HANDLED", { by: "PingComponent" });
  }
}

class TaskBidComponent implements ConversationComponent {
  readonly kinds: PayloadKind[] = ["task-bid"];
  handle(_e: MessageEnvelope, payload: DecryptedPayload, ctx: ConversationContext): void {
    ctx.emit("CONVERSATION_HANDLED", { by: "TaskBidComponent", bid: payload.body });
  }
}

class JoinLeaveComponent implements ConversationComponent {
  readonly kinds: PayloadKind[] = ["join-notify", "leave-notify"];
  handle(_e: MessageEnvelope, payload: DecryptedPayload, ctx: ConversationContext): void {
    ctx.emit("CONVERSATION_HANDLED", { by: "JoinLeaveComponent", kind: payload.kind });
  }
}

class ChatComponent implements ConversationComponent {
  readonly kinds: PayloadKind[] = ["chat", "system"];
  handle(_e: MessageEnvelope, payload: DecryptedPayload, ctx: ConversationContext): void {
    ctx.emit("CONVERSATION_HANDLED", { by: "ChatComponent", kind: payload.kind });
  }
}

export class ConversationRouter {
  private readonly byKind = new Map<PayloadKind, ConversationComponent>();

  constructor(components: ConversationComponent[]) {
    for (const c of components) for (const k of c.kinds) this.byKind.set(k, c);
  }

  route(envelope: MessageEnvelope, payload: DecryptedPayload, ctx: ConversationContext): void {
    const component = this.byKind.get(payload.kind);
    if (!component) {
      ctx.emit("CONVERSATION_UNROUTED", { kind: payload.kind });
      return;
    }
    component.handle(envelope, payload, ctx);
  }
}

export class ComponentControlledHandler implements ConversationHandler {
  readonly mode = "component-controlled" as const;
  private readonly router = new ConversationRouter([
    new PingComponent(),
    new TaskBidComponent(),
    new JoinLeaveComponent(),
    new ChatComponent(),
  ]);

  handleIncoming(
    envelope: MessageEnvelope,
    payload: DecryptedPayload,
    ctx: ConversationContext,
  ): void {
    this.router.route(envelope, payload, ctx);
  }
}
