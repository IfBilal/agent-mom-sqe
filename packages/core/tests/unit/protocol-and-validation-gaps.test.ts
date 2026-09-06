import { describe, expect, it } from "vitest";
import {
  DatagramTooLargeError,
  decodeBroadcast,
  decodeDatagram,
  encodeBroadcast,
  encodeDatagram,
  isKeyRequest,
  newGroupKey,
  validateEnvelope,
  type MessageEnvelope,
} from "../../src/index.js";

function env(over: Partial<MessageEnvelope>): MessageEnvelope {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    mode: "multicast",
    senderId: "agent-A",
    groupAddress: "239.1.1.5",
    sequenceNumber: 1,
    timestampSentMs: 1,
    encrypted: false,
    payload: "{}",
    ...over,
  };
}

describe("broadcast-framing — encode / decode / size cap", () => {
  it("round-trips a broadcast datagram", () => {
    const e = env({ mode: "broadcast", groupAddress: undefined, recipientId: undefined });
    expect(decodeBroadcast(encodeBroadcast(e))).toEqual(e);
  });
  it("rejects an over-size broadcast payload", () => {
    const e = env({ mode: "broadcast", groupAddress: undefined, payload: "x".repeat(60001) });
    expect(() => encodeBroadcast(e)).toThrow(DatagramTooLargeError);
  });
});

describe("multicast-framing — decodeDatagram", () => {
  it("parses a datagram buffer back to an envelope", () => {
    const e = env({ ttl: 5 });
    expect(decodeDatagram(encodeDatagram(e))).toEqual(e);
  });
});

describe("key-holder-protocol — isKeyRequest", () => {
  it("recognises a REQUEST_GROUP_KEY body", () => {
    expect(isKeyRequest({ action: "REQUEST_GROUP_KEY", groupAddress: "239.1.1.5" })).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isKeyRequest({ action: "SOMETHING" })).toBe(false);
    expect(isKeyRequest(null)).toBe(false);
    expect(isKeyRequest("REQUEST_GROUP_KEY")).toBe(false);
  });
});

describe("crypto — newGroupKey", () => {
  it("returns 32 random bytes, distinct each call", () => {
    const a = newGroupKey();
    const b = newGroupKey();
    expect(a).toHaveLength(32);
    expect(a.equals(b)).toBe(false);
  });
});

describe("envelope-validator — remaining branches", () => {
  it("unicast without recipientId → MISSING_RECIPIENT", () => {
    expect(validateEnvelope(env({ mode: "unicast", groupAddress: undefined, recipientId: undefined })).code).toBe("MISSING_RECIPIENT");
  });
  it("multicast without groupAddress → MISSING_GROUP_ADDRESS", () => {
    expect(validateEnvelope(env({ groupAddress: undefined })).code).toBe("MISSING_GROUP_ADDRESS");
  });
  it("a well-formed unicast envelope is OK", () => {
    expect(validateEnvelope(env({ mode: "unicast", groupAddress: undefined, recipientId: "agent-B" })).ok).toBe(true);
  });
  it("a well-formed multicast envelope is OK", () => {
    expect(validateEnvelope(env({ ttl: 3 })).ok).toBe(true);
  });
  it("broadcast with a ttl → TTL_ON_NON_MULTICAST", () => {
    expect(validateEnvelope(env({ mode: "broadcast", groupAddress: undefined, recipientId: undefined, ttl: 2 })).code).toBe("TTL_ON_NON_MULTICAST");
  });
  it("encrypted:false with a stray iv → STRAY_CRYPTO_FIELDS", () => {
    expect(validateEnvelope(env({ mode: "unicast", groupAddress: undefined, recipientId: "agent-B", encrypted: false, iv: "abc" })).code).toBe("STRAY_CRYPTO_FIELDS");
  });
  it("encrypted:false with a stray authTag → STRAY_CRYPTO_FIELDS", () => {
    expect(validateEnvelope(env({ mode: "unicast", groupAddress: undefined, recipientId: "agent-B", encrypted: false, authTag: "abc" })).code).toBe("STRAY_CRYPTO_FIELDS");
  });
  it("encrypted:true with only authTag missing → MALFORMED_CRYPTO_FIELDS", () => {
    expect(validateEnvelope(env({ mode: "unicast", groupAddress: undefined, recipientId: "agent-B", encrypted: true, iv: "abc" })).code).toBe("MALFORMED_CRYPTO_FIELDS");
  });
});
