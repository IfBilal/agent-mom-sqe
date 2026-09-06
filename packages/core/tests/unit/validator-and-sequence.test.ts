import { describe, expect, it } from "vitest";
import { SequenceChecker, validateEnvelope } from "../../src/index.js";
import type { MessageEnvelope } from "../../src/index.js";

function env(overrides: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    mode: "unicast",
    senderId: "agent-A",
    recipientId: "agent-B",
    sequenceNumber: 1,
    timestampSentMs: 1000,
    encrypted: false,
    payload: "{}",
    ...overrides,
  };
}

describe("COND-08 — sequenceNumber of lastSeen+2 raises SEQUENCE_ANOMALY; lastSeen+1 does not (BR-03)", () => {
  it("boundary", () => {
    const c = new SequenceChecker();
    expect(c.observe("agent-A", "agent-B", 1).anomaly).toBe(false);
    expect(c.observe("agent-A", "agent-B", 2).anomaly).toBe(false);
    expect(c.observe("agent-A", "agent-B", 4).anomaly).toBe(true); // skipped 3
  });

  it("is scoped per (sender, recipient), not global", () => {
    const c = new SequenceChecker();
    c.observe("agent-A", "agent-B", 1);
    expect(c.observe("agent-A", "agent-C", 1).anomaly).toBe(false);
  });

  it("does not resequence — only observes", () => {
    const c = new SequenceChecker();
    const obs = c.observe("agent-A", "agent-B", 5);
    expect(obs).toMatchObject({ anomaly: true, expected: 1, received: 5 });
  });
});

describe("COND-24 — a destination outside 224.0.0.0/4 is rejected (BR-10)", () => {
  it.each(["10.0.0.1", "192.168.1.1", "223.255.255.255", "240.0.0.1"])(
    "rejects %s",
    (addr) => {
      const r = validateEnvelope(env({ mode: "multicast", recipientId: undefined, groupAddress: addr }));
      expect(r.ok).toBe(false);
      expect(r.code).toBe("GROUP_ADDRESS_OUT_OF_RANGE");
    },
  );

  it.each(["224.0.0.1", "239.1.1.5", "239.255.255.255"])("accepts %s", (addr) => {
    const r = validateEnvelope(env({ mode: "multicast", recipientId: undefined, groupAddress: addr }));
    expect(r.ok).toBe(true);
  });
});

describe("§8 invariants — BR-16 malformed crypto fields (TC-12 target)", () => {
  it("encrypted=true without iv/authTag is MALFORMED_CRYPTO_FIELDS", () => {
    const r = validateEnvelope(env({ encrypted: true }));
    expect(r.code).toBe("MALFORMED_CRYPTO_FIELDS");
  });

  it("encrypted=false with stray iv is STRAY_CRYPTO_FIELDS", () => {
    const r = validateEnvelope(env({ encrypted: false, iv: "abc" }));
    expect(r.code).toBe("STRAY_CRYPTO_FIELDS");
  });

  it("ttl on a unicast envelope is TTL_ON_NON_MULTICAST", () => {
    const r = validateEnvelope(env({ ttl: 5 }));
    expect(r.code).toBe("TTL_ON_NON_MULTICAST");
  });
});
