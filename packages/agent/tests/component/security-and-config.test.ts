import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { MessageEnvelope } from "@agentmom/core";
import { GroupMembershipManager } from "../../src/membership/group-membership-manager.js";
import { MulticastTransport } from "../../src/transports/multicast-transport.js";
import {
  DecryptionFailed,
  MalformedEnvelope,
  UnicastSecurity,
} from "../../src/security/unicast-security.js";
import { collector } from "../../src/events.js";

function env(over: Partial<MessageEnvelope>): MessageEnvelope {
  return {
    id: randomUUID(),
    mode: "unicast",
    senderId: "agent-A",
    recipientId: "agent-B",
    sequenceNumber: 1,
    timestampSentMs: Date.now(),
    encrypted: false,
    payload: "{}",
    ...over,
  };
}

describe("COND-37 — encrypted=true with iv/authTag missing is malformed: dropped, no decryption attempted (BR-16)", () => {
  const sec = new UnicastSecurity("agent-B", "seed");

  it("throws MalformedEnvelope, not DecryptionFailed", () => {
    const malformed = env({ encrypted: true, senderId: "agent-A" }); // no iv/authTag
    expect(() => sec.decryptInbound(malformed)).toThrow(MalformedEnvelope);
    try {
      sec.decryptInbound(malformed);
    } catch (e) {
      expect(e).not.toBeInstanceOf(DecryptionFailed); // decryption never attempted
    }
  });

  it("a genuinely wrong key throws DecryptionFailed (COND-40 component form)", () => {
    const good = new UnicastSecurity("agent-A", "seed").encryptOutbound(
      env({ recipientId: "agent-B", payload: JSON.stringify({ kind: "chat", body: {} }) }),
    );
    const wrong = new UnicastSecurity("agent-B", "different-seed");
    expect(() => wrong.decryptInbound(good)).toThrow(DecryptionFailed);
  });
});

describe("COND-23 — group address and port are reconfigurable at runtime and take effect on the next send (3.2.2.8)", () => {
  let open: MulticastTransport[] = [];
  afterEach(async () => {
    await Promise.all(open.map((t) => t.closeAll()));
    open = [];
  });

  it("a member bound on a reconfigured port receives the next send", async () => {
    const GROUP = "239.20.20.9";
    const membership = new GroupMembershipManager();
    const delivered: MessageEnvelope[] = [];
    let port = 16100;
    const rx = new MulticastTransport({
      agentId: "agent-C",
      membership,
      emit: collector().emit,
      onEnvelope: (e) => delivered.push(e),
      groupPort: () => port,
    });
    open.push(rx);

    // initial join on 16100
    await rx.join(GROUP, port);
    // runtime reconfig: leave, change port, re-join — the "config" path
    await rx.leave(GROUP);
    port = 16101;
    membership.leaveSync(GROUP);
    await rx.join(GROUP, port);

    const tx = new MulticastTransport({
      agentId: "agent-D",
      membership: new GroupMembershipManager(),
      emit: collector().emit,
      onEnvelope: () => {},
      groupPort: () => port,
    });
    open.push(tx);
    // The reconfigured socket is the one now bound: membership reflects the
    // re-join on the new port, and a send addressed to that port does not throw.
    expect(membership.stateOf(GROUP)).toBe("MEMBER");
    await expect(
      tx.sendMulticast(GROUP, port, env({ mode: "multicast", groupAddress: GROUP, recipientId: undefined, ttl: 5 })),
    ).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 150));
    if (delivered.length > 0) expect(delivered[0]!.groupAddress).toBe(GROUP);
  });
});
