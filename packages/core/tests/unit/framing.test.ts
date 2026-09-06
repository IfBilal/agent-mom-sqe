import { describe, expect, it } from "vitest";
import {
  DatagramTooLargeError,
  FrameDecoder,
  MAX_DATAGRAM_BYTES,
  decode,
  encodeDatagram,
  encodeFrame,
  isTtlExpired,
  stampTtl,
} from "../../src/index.js";
import type { MessageEnvelope } from "../../src/index.js";

function env(overrides: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    mode: "unicast",
    senderId: "agent-A",
    recipientId: "agent-B",
    sequenceNumber: 1,
    timestampSentMs: 1000,
    encrypted: false,
    payload: JSON.stringify({ kind: "chat", body: { text: "hi" } }),
    ...overrides,
  };
}

describe("COND-01 — encodeFrame → decode round-trips unchanged at arbitrary size", () => {
  it.each([0, 1, 50, 5000, 40000])("payload of ~%i bytes", (n) => {
    const original = env({ payload: "x".repeat(n) });
    const round = decode(encodeFrame(original));
    expect(round).toEqual(original);
  });
});

describe("COND-02 — a frame split across two data events reassembles into exactly one envelope", () => {
  it("splits mid-frame", () => {
    const frame = encodeFrame(env());
    const decoder = new FrameDecoder();
    const cut = 7;
    expect(decoder.push(frame.subarray(0, cut))).toHaveLength(0);
    const out = decoder.push(frame.subarray(cut));
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(env());
  });
});

describe("COND-03 — two frames coalesced into one data event separate into exactly two envelopes", () => {
  it("splits back into two", () => {
    const a = env({ sequenceNumber: 1 });
    const b = env({ sequenceNumber: 2 });
    const decoder = new FrameDecoder();
    const out = decoder.push(Buffer.concat([encodeFrame(a), encodeFrame(b)]));
    expect(out).toHaveLength(2);
    expect(out[0]!.sequenceNumber).toBe(1);
    expect(out[1]!.sequenceNumber).toBe(2);
  });

  it("handles three frames plus a partial fourth", () => {
    const frames = [1, 2, 3].map((s) => encodeFrame(env({ sequenceNumber: s })));
    const partial = encodeFrame(env({ sequenceNumber: 4 })).subarray(0, 3);
    const decoder = new FrameDecoder();
    const out = decoder.push(Buffer.concat([...frames, partial]));
    expect(out).toHaveLength(3);
  });
});

describe("COND-25 — payload at exactly MAX_DATAGRAM_BYTES is accepted; at +1 rejected", () => {
  it("exact boundary", () => {
    const base = Buffer.byteLength(JSON.stringify(env({ mode: "multicast", groupAddress: "239.1.1.5", recipientId: undefined, payload: "" })), "utf8");
    const room = MAX_DATAGRAM_BYTES - base;
    const okEnv = env({ mode: "multicast", groupAddress: "239.1.1.5", recipientId: undefined, payload: "x".repeat(room) });
    expect(() => encodeDatagram(okEnv)).not.toThrow();
    const tooBig = env({ mode: "multicast", groupAddress: "239.1.1.5", recipientId: undefined, payload: "x".repeat(room + 1) });
    expect(() => encodeDatagram(tooBig)).toThrow(DatagramTooLargeError);
  });
});

describe("COND-19 — ttl = 1 deliverable; ttl = 0 expired — exact boundary", () => {
  it("boundary", () => {
    expect(isTtlExpired(env({ mode: "multicast", ttl: 1 }))).toBe(false);
    expect(isTtlExpired(env({ mode: "multicast", ttl: 0 }))).toBe(true);
    expect(isTtlExpired(env({ mode: "multicast", ttl: -1 }))).toBe(true);
  });

  it("BR-08 — default TTL is stamped when the sender sets none", () => {
    const stamped = stampTtl(env({ mode: "multicast", ttl: undefined }));
    expect(stamped.ttl).toBe(1);
  });
});
