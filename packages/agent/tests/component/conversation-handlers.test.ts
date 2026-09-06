import { describe, expect, it } from "vitest";
import type { DecryptedPayload, MessageEnvelope, PayloadKind } from "@agentmom/core";
import { AgentControlledHandler } from "../../src/architecture/agent-controlled.js";
import { ComponentControlledHandler } from "../../src/architecture/component-controlled.js";
import type { ConversationContext } from "../../src/architecture/conversation-handler.js";

function ctx(agentId = "agent-B") {
  const emitted: Array<{ type: string; detail: Record<string, unknown> }> = [];
  const replies: Array<{ to: string; payload: DecryptedPayload; encrypted: boolean }> = [];
  const c: ConversationContext = {
    agentId,
    emit: (type, detail) => emitted.push({ type, detail }),
    reply: (to, payload, encrypted) => replies.push({ to, payload, encrypted }),
  };
  return { c, emitted, replies };
}

function envelope(over: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    mode: "multicast",
    senderId: "agent-A",
    groupAddress: "239.1.1.5",
    recipientId: "agent-B",
    sequenceNumber: 1,
    timestampSentMs: 1,
    encrypted: false,
    payload: "{}",
    ...over,
  };
}

const KINDS: PayloadKind[] = ["ping", "task-bid", "join-notify", "leave-notify", "chat", "system"];

describe("AgentControlledHandler — the agent runs the conversation directly", () => {
  it.each(KINDS)("handles a %s payload and emits CONVERSATION_HANDLED", (kind) => {
    const h = new AgentControlledHandler();
    const { c, emitted } = ctx();
    h.handleIncoming(envelope(), { kind, body: { n: 1 } }, c);
    expect(emitted.some((e) => e.type === "CONVERSATION_HANDLED")).toBe(true);
  });

  it("replies pong to a ping from another agent", () => {
    const h = new AgentControlledHandler();
    const { c, replies } = ctx();
    h.handleIncoming(envelope({ senderId: "agent-A" }), { kind: "ping", body: {} }, c);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.payload.body).toMatchObject({ pong: true });
  });

  it("does not pong its own ping", () => {
    const h = new AgentControlledHandler();
    const { c, replies } = ctx("agent-A");
    h.handleIncoming(envelope({ senderId: "agent-A" }), { kind: "ping", body: {} }, c);
    expect(replies).toHaveLength(0);
  });

  it("mode is 'agent-controlled'", () => {
    expect(new AgentControlledHandler().mode).toBe("agent-controlled");
  });
});

describe("ComponentControlledHandler — pluggable components run the conversation", () => {
  it.each(KINDS)("routes a %s payload to a component (CONVERSATION_HANDLED)", (kind) => {
    const h = new ComponentControlledHandler();
    const { c, emitted } = ctx();
    h.handleIncoming(envelope(), { kind, body: {} }, c);
    expect(emitted.some((e) => e.type === "CONVERSATION_HANDLED")).toBe(true);
  });

  it("PingComponent replies pong", () => {
    const h = new ComponentControlledHandler();
    const { c, replies } = ctx();
    h.handleIncoming(envelope({ senderId: "agent-A" }), { kind: "ping", body: {} }, c);
    expect(replies[0]!.payload.body).toMatchObject({ pong: true });
  });

  it("an unknown kind emits CONVERSATION_UNROUTED, not a crash", () => {
    const h = new ComponentControlledHandler();
    const { c, emitted } = ctx();
    h.handleIncoming(envelope(), { kind: "totally-unknown" as PayloadKind, body: {} }, c);
    expect(emitted.some((e) => e.type === "CONVERSATION_UNROUTED")).toBe(true);
  });

  it("mode is 'component-controlled'", () => {
    expect(new ComponentControlledHandler().mode).toBe("component-controlled");
  });
});
