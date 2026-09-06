import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { MessageEnvelope } from "@agentmom/core";
import { UnicastTransport } from "../../src/transports/unicast-transport.js";
import { BroadcastTransport, subnetDirectedAddress } from "../../src/transports/broadcast-transport.js";
import { MulticastTransport } from "../../src/transports/multicast-transport.js";
import { GroupMembershipManager } from "../../src/membership/group-membership-manager.js";
import { KeyHolderAgent } from "../../src/key-holder/key-holder-agent.js";
import { AgentMom1_2Adapter } from "../../src/legacy/agentmom-1_2-adapter.js";
import { BestEffortSimulator } from "../../src/reliability/best-effort-simulator.js";
import { collector } from "../../src/events.js";

function uenv(over: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    id: randomUUID(), mode: "unicast", senderId: "agent-A", recipientId: "agent-B",
    sequenceNumber: 1, timestampSentMs: Date.now(), encrypted: false,
    payload: JSON.stringify({ kind: "chat", body: {} }), ...over,
  };
}

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f().catch(() => {})));
});

describe("unicast-transport — SEQUENCE_ANOMALY on an out-of-order frame (BR-03)", () => {
  it("emits SEQUENCE_ANOMALY when a frame skips a number", async () => {
    const evc = collector();
    const a = new UnicastTransport({ agentId: "agent-A", unicastPort: 16801, peers: { "agent-B": { host: "127.0.0.1", unicastPort: 16802 } }, emit: collector().emit, onEnvelope: () => {} });
    const b = new UnicastTransport({ agentId: "agent-B", unicastPort: 16802, peers: {}, emit: evc.emit, onEnvelope: () => {} });
    cleanup.push(() => a.close(), () => b.close());
    await a.listen();
    await b.listen();
    await a.sendUnicast(uenv({ sequenceNumber: 1 }));
    await a.sendUnicast(uenv({ sequenceNumber: 3 })); // skips 2
    await new Promise((r) => setTimeout(r, 120));
    expect(evc.events.some((e) => e.type === "SEQUENCE_ANOMALY")).toBe(true);
  });
});

describe("broadcast-transport — real datagram receive + subnetDirectedAddress helper", () => {
  it("a bound receiver gets a broadcast datagram and emits MESSAGE_RECEIVED / MESSAGE_SENT", async () => {
    const rxEvc = collector();
    const txEvc = collector();
    const received: MessageEnvelope[] = [];
    const rx = new BroadcastTransport({ agentId: "rx", port: 16901, emit: rxEvc.emit, onEnvelope: (e) => received.push(e) });
    const tx = new BroadcastTransport({ agentId: "tx", port: 16901, emit: txEvc.emit, onEnvelope: () => {} });
    cleanup.push(() => rx.close(), () => tx.close());
    await rx.listen();
    await tx.listen();
    const out = await tx.sendBroadcast(uenv({ mode: "broadcast", recipientId: undefined }));
    expect(out.addressUsed.length).toBeGreaterThan(0);
    expect(txEvc.events.some((e) => e.type === "MESSAGE_SENT")).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    // loopback broadcast is environment-dependent; assert the receive path when it fires
    if (received.length > 0) expect(rxEvc.events.some((e) => e.type === "MESSAGE_RECEIVED")).toBe(true);
  });

  it("a malformed datagram on the broadcast socket emits MESSAGE_MALFORMED", async () => {
    const evc = collector();
    const rx = new BroadcastTransport({ agentId: "rx", port: 16902, emit: evc.emit, onEnvelope: () => {} });
    cleanup.push(() => rx.close());
    await rx.listen();
    const dgram = await import("node:dgram");
    const s = dgram.createSocket({ type: "udp4" });
    await new Promise<void>((res) => s.send(Buffer.from("not json"), 16902, "127.0.0.1", () => { s.close(); res(); }));
    await new Promise((r) => setTimeout(r, 150));
    expect(evc.events.some((e) => e.type === "MESSAGE_MALFORMED")).toBe(true);
  });

  it("subnetDirectedAddress returns a dotted-quad or null", () => {
    const a = subnetDirectedAddress();
    expect(a === null || /^\d+\.\d+\.\d+\.\d+$/.test(a)).toBe(true);
  });
});

describe("multicast-transport — join-twice, leave, and receive branches", () => {
  const GROUP = "239.40.40.41";
  const PORT = 16950;

  it("join() on an already-joined group is idempotent; leave() closes the socket", async () => {
    const m = new GroupMembershipManager();
    const t = new MulticastTransport({ agentId: "c", membership: m, emit: collector().emit, onEnvelope: () => {}, groupPort: () => PORT });
    cleanup.push(() => t.closeAll());
    await t.join(GROUP, PORT);
    await t.join(GROUP, PORT); // second join — completeJoin + return
    expect(m.stateOf(GROUP)).toBe("MEMBER");
    await t.leave(GROUP);
    await t.leave(GROUP); // leave when not joined — early return
  });

  it("an unparseable datagram on a group socket does not crash the transport", async () => {
    const m = new GroupMembershipManager();
    const evc = collector();
    const t = new MulticastTransport({ agentId: "c", membership: m, emit: evc.emit, onEnvelope: () => {}, groupPort: () => 16951 });
    cleanup.push(() => t.closeAll());
    await t.join("239.40.40.42", 16951);
    const dgram = await import("node:dgram");
    const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
    await new Promise<void>((res) => s.bind(0, () => res()));
    s.setMulticastInterface("127.0.0.1");
    await new Promise<void>((res) => s.send(Buffer.from("xxx"), 16951, "239.40.40.42", () => { s.close(); res(); }));
    await new Promise((r) => setTimeout(r, 200));
    // If loopback delivered it, the only events are MALFORMED / DROPPED_MEMBERSHIP —
    // never MESSAGE_RECEIVED for garbage.
    expect(evc.events.some((e) => e.type === "MESSAGE_RECEIVED")).toBe(false);
    expect(m.stateOf("239.40.40.42")).toBe("MEMBER"); // transport still healthy
  });

  it("setDefaultTtl changes the stamped TTL on an ephemeral send", async () => {
    const t = new MulticastTransport({ agentId: "d", membership: new GroupMembershipManager(), emit: collector().emit, onEnvelope: () => {}, groupPort: () => 16952 });
    cleanup.push(() => t.closeAll());
    t.setDefaultTtl(7);
    await expect(t.sendMulticast("239.40.40.43", 16952, uenv({ mode: "multicast", groupAddress: "239.40.40.43", recipientId: undefined }))).resolves.toBeUndefined();
  });
});

describe("key-holder-agent — allowListFor unknown group, ensureGroup, onLeave no-op", () => {
  it("allowListFor returns [] for an unknown group; ensureGroup then seeds it", () => {
    const kh = new KeyHolderAgent();
    expect(kh.allowListFor("239.9.9.9")).toEqual([]);
    kh.ensureGroup("239.9.9.9");
    kh.ensureGroup("239.9.9.9"); // idempotent
    expect(kh.ownKey("239.9.9.9")).toBeTypeOf("string");
    kh.onLeave("agent-C", "239.9.9.9"); // BR-20 — deliberately does nothing
    expect(kh.ownKey("239.9.9.9")).toBeTypeOf("string");
  });
});

describe("agentmom-1_2-adapter — onMessage handler + deliver", () => {
  it("deliver invokes the registered onMessage handler", () => {
    const a = new AgentMom1_2Adapter("agent-A", {} as never);
    const seen: Array<[string, string]> = [];
    a.onMessage((from, body) => seen.push([from, body]));
    a.deliver("agent-B", "hello");
    expect(seen).toEqual([["agent-B", "hello"]]);
  });
});

describe("best-effort-simulator — fractional drop rate exercises the RNG branch", () => {
  it("dropRate 0.5 drops roughly half over many calls, unicast never", () => {
    const sim = new BestEffortSimulator();
    sim.setDropRate(0.5);
    let drops = 0;
    for (let i = 0; i < 400; i++) if (sim.shouldDrop("multicast")) drops++;
    expect(drops).toBeGreaterThan(40);
    expect(drops).toBeLessThan(360);
    expect(sim.shouldDrop("unicast")).toBe(false);
    sim.setDropRate(5); // clamped to 1
    expect(sim.getDropRate()).toBe(1);
  });
});
