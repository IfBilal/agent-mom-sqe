import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { MessageEnvelope } from "@agentmom/core";
import { UnicastTransport } from "../../src/transports/unicast-transport.js";
import { collector } from "../../src/events.js";

// Level C — component. Real sockets on loopback, collaborators stubbed.

const ports = { A: 17001, B: 17002 };
let open: UnicastTransport[] = [];

afterEach(async () => {
  await Promise.all(open.map((t) => t.close()));
  open = [];
});

function envelope(over: Partial<MessageEnvelope>): MessageEnvelope {
  return {
    id: randomUUID(),
    mode: "unicast",
    senderId: "agent-A",
    recipientId: "agent-B",
    sequenceNumber: 1,
    timestampSentMs: Date.now(),
    encrypted: false,
    payload: JSON.stringify({ kind: "chat", body: { text: "hi" } }),
    ...over,
  };
}

describe("COND-04 — a send establishes a connection and the addressed agent receives the envelope", () => {
  it("delivers A→B", async () => {
    const received: MessageEnvelope[] = [];
    const a = new UnicastTransport({ agentId: "agent-A", unicastPort: ports.A, peers: { "agent-B": { host: "127.0.0.1", unicastPort: ports.B } }, emit: collector().emit, onEnvelope: () => {} });
    const b = new UnicastTransport({ agentId: "agent-B", unicastPort: ports.B, peers: {}, emit: collector().emit, onEnvelope: (e) => received.push(e) });
    open.push(a, b);
    await a.listen();
    await b.listen();

    await a.sendUnicast(envelope({}));
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(1);
    expect(received[0]!.senderId).toBe("agent-A");
  });
});

describe("COND-05 — an envelope whose recipientId ≠ this agent is dropped and raises PROTOCOL_VIOLATION (BR-01)", () => {
  it("drops the mismatch", async () => {
    const evc = collector();
    const received: MessageEnvelope[] = [];
    // agent-Z resolves to B's port, but the envelope is addressed to agent-Z,
    // so B must reject it at the application layer (BR-01).
    const a = new UnicastTransport({ agentId: "agent-A", unicastPort: ports.A, peers: { "agent-Z": { host: "127.0.0.1", unicastPort: ports.B } }, emit: collector().emit, onEnvelope: () => {} });
    const b = new UnicastTransport({ agentId: "agent-B", unicastPort: ports.B, peers: {}, emit: evc.emit, onEnvelope: (e) => received.push(e) });
    open.push(a, b);
    await a.listen();
    await b.listen();

    await a.sendUnicast(envelope({ recipientId: "agent-Z" }));
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);
    expect(evc.events.some((e) => e.type === "PROTOCOL_VIOLATION")).toBe(true);
  });
});

describe("COND-09 — sending to a stopped agent surfaces a connection error, not a crash", () => {
  it("rejects cleanly", async () => {
    const a = new UnicastTransport({ agentId: "agent-A", unicastPort: ports.A, peers: { "agent-B": { host: "127.0.0.1", unicastPort: ports.B } }, emit: collector().emit, onEnvelope: () => {} });
    open.push(a);
    await a.listen();
    await expect(a.sendUnicast(envelope({}))).rejects.toBeInstanceOf(Error);
  });
});
