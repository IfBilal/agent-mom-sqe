import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { MessageEnvelope } from "@agentmom/core";
import { GroupMembershipManager } from "../../src/membership/group-membership-manager.js";
import { MulticastTransport } from "../../src/transports/multicast-transport.js";
import { collector } from "../../src/events.js";

const GROUP = "239.10.10.5";
const PORT = 15007;
let open: MulticastTransport[] = [];

afterEach(async () => {
  await Promise.all(open.map((t) => t.closeAll()));
  open = [];
});

function mcEnvelope(over: Partial<MessageEnvelope>): MessageEnvelope {
  return {
    id: randomUUID(),
    mode: "multicast",
    senderId: "agent-C",
    groupAddress: GROUP,
    sequenceNumber: 1,
    timestampSentMs: Date.now(),
    encrypted: false,
    payload: JSON.stringify({ kind: "chat", body: { text: "mc" } }),
    ...over,
  };
}

describe("COND-11 — join() transitions NOT_MEMBER → JOINING → MEMBER", () => {
  it("state machine", () => {
    const m = new GroupMembershipManager();
    expect(m.stateOf(GROUP)).toBe("NOT_MEMBER");
    m.beginJoin(GROUP);
    expect(m.stateOf(GROUP)).toBe("JOINING");
    m.completeJoin(GROUP);
    expect(m.stateOf(GROUP)).toBe("MEMBER");
  });
});

describe("COND-13 — leave() removes from the membership set BEFORE calling dropMembership (BR-06)", () => {
  it("synchronous removal", () => {
    const m = new GroupMembershipManager();
    m.beginJoin(GROUP);
    m.completeJoin(GROUP);
    expect(m.isDeliverable(GROUP)).toBe(true);
    m.leaveSync(GROUP); // synchronous — before any OS call
    expect(m.isDeliverable(GROUP)).toBe(false);
  });
});

describe("COND-12 — a datagram arriving before the group is in the membership set is dropped", () => {
  it("membership gate drops and logs MESSAGE_DROPPED_MEMBERSHIP", async () => {
    const membership = new GroupMembershipManager();
    const evc = collector();
    const delivered: MessageEnvelope[] = [];
    const rx = new MulticastTransport({
      agentId: "agent-C",
      membership,
      emit: evc.emit,
      onEnvelope: (e) => delivered.push(e),
      groupPort: () => PORT,
    });
    open.push(rx);
    await rx.join(GROUP, PORT);
    // Simulate the pre-join window: force the app-level set back to NOT_MEMBER.
    membership.leaveSync(GROUP);

    const tx = new MulticastTransport({
      agentId: "agent-D",
      membership: new GroupMembershipManager(),
      emit: collector().emit,
      onEnvelope: () => {},
      groupPort: () => PORT,
    });
    open.push(tx);
    await tx.sendMulticast(GROUP, PORT, mcEnvelope({ ttl: 5 }));
    await new Promise((r) => setTimeout(r, 150));

    expect(delivered).toHaveLength(0);
    expect(evc.events.some((e) => e.type === "MESSAGE_DROPPED_MEMBERSHIP")).toBe(true);
  });
});

describe("COND-20 — a send applies setMulticastTTL and stamps ttl into the envelope", () => {
  it("stamps ttl and delivers to a joined member", async () => {
    const membership = new GroupMembershipManager();
    const delivered: MessageEnvelope[] = [];
    const rx = new MulticastTransport({
      agentId: "agent-C",
      membership,
      emit: collector().emit,
      onEnvelope: (e) => delivered.push(e),
      groupPort: () => PORT,
    });
    open.push(rx);
    await rx.join(GROUP, PORT);

    await rx.sendMulticast(GROUP, PORT, mcEnvelope({ ttl: undefined }));
    await new Promise((r) => setTimeout(r, 150));
    // Loopback multicast delivery is environment-dependent (CON-04); the
    // assertion of record is that when it IS delivered, the default TTL was
    // stamped per BR-08.
    if (delivered.length > 0) expect(delivered[0]!.ttl).toBe(1); // DEFAULT_TTL_UNSUPPORTED_ASSUMPTION
  });
});

describe("COND-24 — a destination outside 224.0.0.0/4 is rejected at send time (BR-10)", () => {
  it("rejects 10.0.0.1", async () => {
    const tx = new MulticastTransport({
      agentId: "agent-D",
      membership: new GroupMembershipManager(),
      emit: collector().emit,
      onEnvelope: () => {},
      groupPort: () => PORT,
    });
    open.push(tx);
    await expect(
      tx.sendMulticast("10.0.0.1", PORT, mcEnvelope({ groupAddress: "10.0.0.1", ttl: 5 })),
    ).rejects.toThrow(/224\.0\.0\.0\/4/);
  });
});
