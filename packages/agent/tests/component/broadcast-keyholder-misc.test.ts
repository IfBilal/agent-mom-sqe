import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { MessageEnvelope } from "@agentmom/core";
import { BroadcastTransport } from "../../src/transports/broadcast-transport.js";
import { KeyHolderAgent } from "../../src/key-holder/key-holder-agent.js";
import { BestEffortSimulator } from "../../src/reliability/best-effort-simulator.js";
import { AgentControlledHandler } from "../../src/architecture/agent-controlled.js";
import { ComponentControlledHandler } from "../../src/architecture/component-controlled.js";
import type { ConversationHandler } from "../../src/architecture/conversation-handler.js";
import { AgentMom1_2Adapter } from "../../src/legacy/agentmom-1_2-adapter.js";
import { collector } from "../../src/events.js";

const PORT = 19001;
let open: BroadcastTransport[] = [];
afterEach(async () => {
  await Promise.all(open.map((t) => t.close()));
  open = [];
});

function bcEnvelope(): MessageEnvelope {
  return {
    id: randomUUID(),
    mode: "broadcast",
    senderId: "agent-A",
    sequenceNumber: 1,
    timestampSentMs: Date.now(),
    encrypted: false,
    payload: JSON.stringify({ kind: "chat", body: { text: "all" } }),
  };
}

describe("COND-28 — the broadcast socket binds with reuseAddr and sets setBroadcast(true) after bind", () => {
  it("two agents share the port without EADDRINUSE", async () => {
    const a = new BroadcastTransport({ agentId: "agent-A", port: PORT, emit: collector().emit, onEnvelope: () => {} });
    const b = new BroadcastTransport({ agentId: "agent-B", port: PORT, emit: collector().emit, onEnvelope: () => {} });
    open.push(a, b);
    await a.listen();
    await expect(b.listen()).resolves.toBeUndefined();
  });
});

describe("COND-31 — EACCES/EPERM surfaces as BROADCAST_PERMISSION_DENIED, not a crash", () => {
  it("simulate toggle produces a handled event", async () => {
    const evc = collector();
    const a = new BroadcastTransport({ agentId: "agent-A", port: PORT, emit: evc.emit, onEnvelope: () => {} });
    open.push(a);
    await a.listen();
    a.setSimulateDenied(true);
    const out = await a.sendBroadcast(bcEnvelope());
    expect(out.addressUsed).toBe("NONE_PERMISSION_DENIED");
    expect(evc.events.some((e) => e.type === "BROADCAST_PERMISSION_DENIED")).toBe(true);
    // Hard rule: a handled simulated failure is a PASS of the error-handling
    // condition — NEVER cited as evidence for a FAILED test status.
  });
});

describe("COND-32 — addressUsed is reported for every broadcast send (BR-12)", () => {
  it("reports an address", async () => {
    const a = new BroadcastTransport({ agentId: "agent-A", port: PORT, emit: collector().emit, onEnvelope: () => {} });
    open.push(a);
    await a.listen();
    const out = await a.sendBroadcast(bcEnvelope());
    expect(typeof out.addressUsed).toBe("string");
    expect(out.addressUsed.length).toBeGreaterThan(0);
  });
});

describe("COND-41 / COND-42 — key holder allow-list gates the group key (BR-18)", () => {
  const kh = new KeyHolderAgent({ "239.1.1.5": ["agent-C", "agent-D"] });

  it("COND-41 — an allow-listed agent's request is granted", () => {
    const grant = kh.handleRequest("agent-C", "239.1.1.5");
    expect(grant.granted).toBe(true);
    expect(grant.groupKeyBase64).toBeTypeOf("string");
  });

  it("COND-42 — a non-allow-listed agent's request is denied", () => {
    const grant = kh.handleRequest("agent-B", "239.1.1.5");
    expect(grant.granted).toBe(false);
    expect(grant.reason).toMatch(/allow-list/);
  });

  it("BR-20 — leave triggers no rotation; a re-request still returns the same key", () => {
    const first = kh.handleRequest("agent-C", "239.1.1.5").groupKeyBase64;
    kh.onLeave("agent-C", "239.1.1.5");
    expect(kh.handleRequest("agent-C", "239.1.1.5").groupKeyBase64).toBe(first);
  });
});

describe("COND-52 — the reliability simulator never touches unicast (BR-23 spirit)", () => {
  it("dropRate = 1.0 drops multicast/broadcast but not unicast", () => {
    const sim = new BestEffortSimulator();
    sim.setDropRate(1);
    expect(sim.shouldDrop("multicast")).toBe(true);
    expect(sim.shouldDrop("broadcast")).toBe(true);
    expect(sim.shouldDrop("unicast")).toBe(false);
  });
});

describe("COND-46 — both handlers satisfy the ConversationHandler interface (BR-21)", () => {
  it("structural conformance", () => {
    const handlers: ConversationHandler[] = [
      new AgentControlledHandler(),
      new ComponentControlledHandler(),
    ];
    for (const h of handlers) {
      expect(typeof h.handleIncoming).toBe("function");
      expect(["agent-controlled", "component-controlled"]).toContain(h.mode);
    }
  });
});

describe("COND-50 — the AgentMom1_2 signature snapshot matches the frozen contract (BR-22)", () => {
  it("adapter exposes exactly sendMessage/onMessage", () => {
    const adapter = new AgentMom1_2Adapter("agent-A", {} as never);
    expect(typeof adapter.sendMessage).toBe("function");
    expect(typeof adapter.onMessage).toBe("function");
    expect(adapter.sendMessage.length).toBe(2); // (toAgentId, body)
    expect(adapter.onMessage.length).toBe(1); // (handler)
  });
});
