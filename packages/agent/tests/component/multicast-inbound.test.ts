import { afterEach, describe, expect, it } from "vitest";
import type { MessageEnvelope } from "@agentmom/core";
import { classifyMulticastInbound } from "../../src/transports/multicast-inbound.js";
import { MulticastTransport } from "../../src/transports/multicast-transport.js";
import { GroupMembershipManager } from "../../src/membership/group-membership-manager.js";
import { encodeDatagram } from "@agentmom/core";
import { collector } from "../../src/events.js";

const G = "239.1.1.5";

function env(over: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    id: "mi-1", mode: "multicast", senderId: "agent-C", groupAddress: G,
    sequenceNumber: 1, timestampSentMs: 1, encrypted: false, ttl: 5, payload: "{}", ...over,
  };
}

describe("classifyMulticastInbound — every branch (BR-04/05, §9.2, BR-09)", () => {
  it("null envelope → malformed", () => {
    expect(classifyMulticastInbound(null, G, true)).toEqual({ kind: "malformed" });
  });
  it("not a member → dropped-membership", () => {
    expect(classifyMulticastInbound(env(), G, false).kind).toBe("dropped-membership");
  });
  it("group address mismatch → protocol-violation", () => {
    const v = classifyMulticastInbound(env({ groupAddress: "239.9.9.9" }), G, true);
    expect(v).toMatchObject({ kind: "protocol-violation", envelopeGroup: "239.9.9.9" });
  });
  it("ttl <= 0 → ttl-expired", () => {
    expect(classifyMulticastInbound(env({ ttl: 0 }), G, true)).toMatchObject({ kind: "ttl-expired", ttl: 0 });
  });
  it("ttl undefined is not expired → deliver", () => {
    expect(classifyMulticastInbound(env({ ttl: undefined }), G, true).kind).toBe("deliver");
  });
  it("in-membership, matching group, live ttl → deliver", () => {
    const v = classifyMulticastInbound(env(), G, true);
    expect(v).toMatchObject({ kind: "deliver" });
  });
  it("no groupAddress on the envelope skips the cross-check → deliver", () => {
    expect(classifyMulticastInbound(env({ groupAddress: undefined }), G, true).kind).toBe("deliver");
  });
});

describe("MulticastTransport.receive — drives the socket callback with synthetic datagrams", () => {
  let open: MulticastTransport[] = [];
  afterEach(async () => {
    await Promise.all(open.splice(0).map((t) => t.closeAll().catch(() => {})));
  });

  function make(membershipState: "MEMBER" | "NOT_MEMBER" = "MEMBER") {
    const m = new GroupMembershipManager();
    if (membershipState === "MEMBER") { m.beginJoin(G); m.completeJoin(G); }
    const evc = collector();
    const delivered: MessageEnvelope[] = [];
    const t = new MulticastTransport({
      agentId: "agent-B", membership: m, emit: evc.emit,
      onEnvelope: (e) => delivered.push(e), groupPort: () => 5007,
    });
    return { t, evc, delivered, m };
  }

  it("a valid datagram to a member → MESSAGE_RECEIVED + onEnvelope", () => {
    const { t, evc, delivered } = make();
    t.receive(G, encodeDatagram(env()));
    expect(evc.events.some((e) => e.type === "MESSAGE_RECEIVED")).toBe(true);
    expect(delivered).toHaveLength(1);
  });

  it("garbage bytes → MESSAGE_MALFORMED", () => {
    const { t, evc } = make();
    t.receive(G, Buffer.from("not-json"));
    expect(evc.events.some((e) => e.type === "MESSAGE_MALFORMED")).toBe(true);
  });

  it("datagram to a non-member → MESSAGE_DROPPED_MEMBERSHIP", () => {
    const { t, evc } = make("NOT_MEMBER");
    t.receive(G, encodeDatagram(env()));
    expect(evc.events.some((e) => e.type === "MESSAGE_DROPPED_MEMBERSHIP")).toBe(true);
  });

  it("mismatched group address → PROTOCOL_VIOLATION", () => {
    const { t, evc } = make();
    t.receive(G, encodeDatagram(env({ groupAddress: "239.7.7.7" })));
    expect(evc.events.some((e) => e.type === "PROTOCOL_VIOLATION")).toBe(true);
  });

  it("expired TTL → MESSAGE_DROPPED_TTL_EXPIRED, not delivered", () => {
    const { t, evc, delivered } = make();
    t.receive(G, encodeDatagram(env({ ttl: 0 })));
    expect(evc.events.some((e) => e.type === "MESSAGE_DROPPED_TTL_EXPIRED")).toBe(true);
    expect(delivered).toHaveLength(0);
  });
});
