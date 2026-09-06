import { describe, expect, it } from "vitest";
import { newGroupKey, type MessageEnvelope } from "@agentmom/core";
import { MulticastSecurity } from "../../src/security/multicast-security.js";
import {
  DecryptionFailed,
  MalformedEnvelope,
  UnicastSecurity,
} from "../../src/security/unicast-security.js";

function env(over: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    mode: "multicast",
    senderId: "agent-A",
    groupAddress: "239.1.1.5",
    recipientId: "agent-B",
    sequenceNumber: 1,
    timestampSentMs: 1,
    encrypted: false,
    payload: JSON.stringify({ kind: "chat", body: { text: "hi" } }),
    ...over,
  };
}

describe("MulticastSecurity — FR6 group-key encrypt/decrypt", () => {
  const key = newGroupKey().toString("base64");

  it("hasKey / storeKey", () => {
    const s = new MulticastSecurity();
    expect(s.hasKey("239.1.1.5")).toBe(false);
    s.storeKey("239.1.1.5", key);
    expect(s.hasKey("239.1.1.5")).toBe(true);
  });

  it("encryptOutbound throws without a held key", () => {
    expect(() => new MulticastSecurity().encryptOutbound(env())).toThrow(/no group key held/);
  });

  it("round-trips with a held key", () => {
    const s = new MulticastSecurity();
    s.storeKey("239.1.1.5", key);
    const enc = s.encryptOutbound(env());
    expect(enc.encrypted).toBe(true);
    expect(s.decryptInbound(enc)).toBe(env().payload);
  });

  it("decryptInbound passes plaintext straight through when not encrypted", () => {
    expect(new MulticastSecurity().decryptInbound(env())).toBe(env().payload);
  });

  it("decryptInbound fails closed with no key (DECRYPTION_FAILED)", () => {
    const s = new MulticastSecurity();
    s.storeKey("239.1.1.5", key);
    const enc = s.encryptOutbound(env());
    expect(() => new MulticastSecurity().decryptInbound(enc)).toThrow(DecryptionFailed);
  });

  it("decryptInbound fails closed with the wrong key", () => {
    const s = new MulticastSecurity();
    s.storeKey("239.1.1.5", key);
    const enc = s.encryptOutbound(env());
    const other = new MulticastSecurity();
    other.storeKey("239.1.1.5", newGroupKey().toString("base64"));
    expect(() => other.decryptInbound(enc)).toThrow(DecryptionFailed);
  });

  it("an envelope with no groupAddress is handled (falls back to '')", () => {
    const s = new MulticastSecurity();
    expect(() => s.encryptOutbound(env({ groupAddress: undefined }))).toThrow(/no group key held/);
    expect(() => s.decryptInbound(env({ groupAddress: undefined, encrypted: true, iv: "a", authTag: "b" }))).toThrow(DecryptionFailed);
  });
});

describe("UnicastSecurity — remaining branches", () => {
  it("encryptOutbound throws without recipientId", () => {
    const s = new UnicastSecurity("agent-A", "seed");
    expect(() => s.encryptOutbound(env({ mode: "unicast", groupAddress: undefined, recipientId: undefined }))).toThrow(/recipientId/);
  });

  it("decryptInbound returns plaintext unchanged when not encrypted", () => {
    const s = new UnicastSecurity("agent-B", "seed");
    expect(s.decryptInbound(env({ mode: "unicast", groupAddress: undefined }))).toBe(env().payload);
  });

  it("malformed (encrypted, missing iv) → MalformedEnvelope, never DecryptionFailed", () => {
    const s = new UnicastSecurity("agent-B", "seed");
    const bad = env({ mode: "unicast", groupAddress: undefined, encrypted: true, authTag: "x" });
    expect(() => s.decryptInbound(bad)).toThrow(MalformedEnvelope);
  });
});
