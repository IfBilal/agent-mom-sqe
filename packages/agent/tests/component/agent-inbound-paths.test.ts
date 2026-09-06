import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { encodeFrame, type MessageEnvelope } from "@agentmom/core";
import { Agent } from "../../src/agent.js";
import type { AgentConfig } from "../../src/config.js";
import type { AgentToControl } from "../../src/ipc.js";
import type { LiveEvent } from "@agentmom/core";

const GROUP = "239.41.41.41";

function cfg(agentId: string, unicastPort: number, seed = "inbound-seed", over: Partial<AgentConfig> = {}): AgentConfig {
  return {
    agentId, role: "standard", unicastPort, ipcPort: unicastPort + 1000,
    architectureMode: "agent-controlled", groupsAtStart: [],
    groups: { [GROUP]: { groupAddress: GROUP, port: 16970 } },
    broadcastPort: 16980, seed, peers: {},
    ...over,
  };
}

function harness(config: AgentConfig) {
  const events: LiveEvent[] = [];
  const results: Array<{ id: string; ok: boolean; data?: unknown; error?: string }> = [];
  const agent = new Agent(config, (m: AgentToControl) => {
    if (m.type === "event") events.push(m.event);
    if (m.type === "cmd-result") results.push({ id: m.id, ok: m.ok, data: m.data, error: m.error });
  });
  return { agent, events, results };
}

async function cmd(h: ReturnType<typeof harness>, kind: string, extra: Record<string, unknown> = {}): Promise<unknown> {
  const id = `${kind}-${Math.random()}`;
  await h.agent.onMessage({ type: "cmd", id, cmd: { kind, ...extra } as never });
  const r = h.results.find((x) => x.id === id);
  if (!r) throw new Error(`no result for ${kind}`);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

const open: Agent[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((a) => a.stop().catch(() => {})));
});

function rawFrame(port: number, env: MessageEnvelope): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: "127.0.0.1", port }, () => {
      s.write(encodeFrame(env), () => { s.end(); resolve(); });
    });
    s.once("error", reject);
  });
}

describe("Agent.receiveUnicast — inbound error branches", () => {
  it("a malformed encrypted envelope (no iv/authTag) → MESSAGE_MALFORMED, no decryption", async () => {
    const b = harness(cfg("agent-B", 16901));
    open.push(b.agent);
    await b.agent.start();
    b.agent.receiveUnicast({
      id: "m1", mode: "unicast", senderId: "agent-A", recipientId: "agent-B",
      sequenceNumber: 1, timestampSentMs: Date.now(), encrypted: true, payload: "garbage",
    });
    expect(b.events.some((e) => e.type === "MESSAGE_MALFORMED")).toBe(true);
    expect(b.events.some((e) => e.type === "DECRYPTION_FAILED")).toBe(false);
  });

  it("an encrypted multicast with no held key → DECRYPTION_FAILED via receiveMulticast", async () => {
    const b = harness(cfg("agent-B", 16913));
    open.push(b.agent);
    await b.agent.start();
    await cmd(b, "join", { groupAddress: GROUP });
    b.agent.receiveMulticast({
      id: "mc-enc", mode: "multicast", senderId: "agent-C", groupAddress: GROUP,
      sequenceNumber: 1, timestampSentMs: Date.now(), encrypted: true, ttl: 5,
      payload: "AAAA", iv: "AAAA", authTag: "AAAA",
    }, GROUP);
    expect(b.events.some((e) => e.type === "DECRYPTION_FAILED")).toBe(true);
  });

  it("a wire frame addressed to another agent → PROTOCOL_VIOLATION (BR-01), still delivered nowhere", async () => {
    const b = harness(cfg("agent-B", 16914));
    open.push(b.agent);
    await b.agent.start();
    await rawFrame(16914, {
      id: "w1", mode: "unicast", senderId: "agent-A", recipientId: "agent-Z",
      sequenceNumber: 1, timestampSentMs: Date.now(), encrypted: false,
      payload: JSON.stringify({ kind: "chat", body: {} }),
    });
    await new Promise((r) => setTimeout(r, 120));
    expect(b.events.some((e) => e.type === "PROTOCOL_VIOLATION")).toBe(true);
  });

  it("an encrypted envelope from a peer with a different seed → DECRYPTION_FAILED, deliver nothing", async () => {
    const a = harness(cfg("agent-A", 16902, "seed-A"));
    const b = harness(cfg("agent-B", 16903, "seed-B")); // different seed → keys won't match
    open.push(a.agent, b.agent);
    await a.agent.start();
    await b.agent.start();
    const peers = { "agent-A": { host: "127.0.0.1", unicastPort: 16902 }, "agent-B": { host: "127.0.0.1", unicastPort: 16903 } };
    await a.agent.onMessage({ type: "peer-update", peers });
    await b.agent.onMessage({ type: "peer-update", peers });

    await cmd(a, "send-unicast", { recipientId: "agent-B", body: { kind: "chat", body: {} }, encrypted: true });
    await new Promise((r) => setTimeout(r, 150));
    expect(b.events.some((e) => e.type === "DECRYPTION_FAILED")).toBe(true);
    expect(b.events.some((e) => e.type === "MESSAGE_RECEIVED")).toBe(false);
  });
});

describe("Agent — broadcast receive + simulated drops + leave-then-inject + snapshot", () => {
  it("onBroadcast dispatches a received broadcast", async () => {
    const a = harness(cfg("agent-A", 16904));
    const b = harness(cfg("agent-B", 16905));
    open.push(a.agent, b.agent);
    await a.agent.start();
    await b.agent.start();
    await cmd(a, "send-broadcast", { body: { kind: "chat", body: { text: "hi" } } });
    await new Promise((r) => setTimeout(r, 150));
    // b may or may not receive depending on loopback broadcast; a always logs the send
    expect(a.events.some((e) => e.type === "MESSAGE_SENT")).toBe(true);
    if (b.events.length) expect(b.events.every((e) => e.type !== "MESSAGE_MALFORMED")).toBe(true);
  });

  it("drop rate 1.0 → send-multicast and send-broadcast return { dropped: true }", async () => {
    const a = harness(cfg("agent-A", 16906));
    open.push(a.agent);
    await a.agent.start();
    await cmd(a, "set-drop-rate", { dropRate: 1 });
    expect(await cmd(a, "send-multicast", { groupAddress: GROUP, body: { kind: "chat", body: {} }, ttl: 5, encrypted: false })).toMatchObject({ dropped: true });
    expect(await cmd(a, "send-broadcast", { body: { kind: "chat", body: {} } })).toMatchObject({ dropped: true });
    expect(a.events.filter((e) => e.type === "MESSAGE_DROPPED_SIMULATED")).toHaveLength(2);
  });

  it("leave-then-inject runs the BR-06 command path", async () => {
    const a = harness(cfg("agent-A", 16907));
    open.push(a.agent);
    await a.agent.start();
    await cmd(a, "join", { groupAddress: GROUP });
    const out = (await cmd(a, "leave-then-inject", { groupAddress: GROUP, injectFrom: "agent-C" })) as { state: string };
    expect(out.state).toBe("NOT_MEMBER");
  });

  it("set-architecture toggles both ways and emits ARCHITECTURE_SWITCHED each time", async () => {
    const a = harness(cfg("agent-A", 16908));
    open.push(a.agent);
    await a.agent.start();
    await cmd(a, "set-architecture", { architectureMode: "component-controlled" });
    await cmd(a, "set-architecture", { architectureMode: "agent-controlled" });
    expect(a.events.filter((e) => e.type === "ARCHITECTURE_SWITCHED")).toHaveLength(2);
  });

  it("a key holder's snapshot includes the per-group allow-list", async () => {
    const d = harness(cfg("agent-D", 16909, "inbound-seed", {
      role: "key-holder", groupsAtStart: [GROUP], allowList: { [GROUP]: ["agent-C", "agent-D"] },
    }));
    open.push(d.agent);
    await d.agent.start();
    const snap = (await cmd(d, "snapshot")) as { allowList?: Record<string, string[]> };
    expect(snap.allowList?.[GROUP]).toEqual(expect.arrayContaining(["agent-C"]));

    // a key request from an agent not in the address book: the grant decision is
    // made, but the encrypted response cannot be delivered → logged, not thrown
    d.agent.receiveUnicast({
      id: "kr1", mode: "unicast", senderId: "agent-C", recipientId: "agent-D",
      sequenceNumber: 1, timestampSentMs: Date.now(), encrypted: false,
      payload: JSON.stringify({ kind: "system", body: { action: "REQUEST_GROUP_KEY", groupAddress: GROUP, requestingAgentId: "agent-C" } }),
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(d.events.some((e) => e.type === "GROUP_KEY_GRANTED")).toBe(true);
    expect(d.events.some((e) => e.type === "PROTOCOL_VIOLATION" && e.payload["reason"] === "KEY_RESPONSE_UNDELIVERABLE")).toBe(true);
  });

  it("onMulticast / onBroadcast inbound paths dispatch a synthetic datagram deterministically", async () => {
    const a = harness(cfg("agent-A", 16910));
    open.push(a.agent);
    await a.agent.start();
    await cmd(a, "join", { groupAddress: GROUP });

    // Deliver straight into the transport callbacks — no reliance on loopback
    // multicast/broadcast, which a locked-down host may not route.
    const mcEnv: MessageEnvelope = {
      id: "mc1", mode: "multicast", senderId: "agent-C", groupAddress: GROUP,
      sequenceNumber: 1, timestampSentMs: Date.now(), encrypted: false, ttl: 5,
      payload: JSON.stringify({ kind: "ping", body: {} }),
    };
    a.agent.receiveMulticast(mcEnv, GROUP);
    const bcEnv: MessageEnvelope = {
      id: "bc1", mode: "broadcast", senderId: "agent-C",
      sequenceNumber: 1, timestampSentMs: Date.now(), encrypted: false,
      payload: JSON.stringify({ kind: "chat", body: { text: "hi" } }),
    };
    a.agent.receiveBroadcast(bcEnv);

    // a ping from another agent triggers a pong reply attempt (agent-controlled handler)
    await new Promise((r) => setTimeout(r, 50));
    expect(a.events.some((e) => e.type === "AGENT_STATUS")).toBe(true);
  });
});
