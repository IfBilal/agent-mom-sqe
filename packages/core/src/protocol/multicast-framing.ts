import { Buffer } from "node:buffer";
import {
  DEFAULT_TTL_UNSUPPORTED_ASSUMPTION,
  MAX_DATAGRAM_BYTES,
} from "../constants.js";
import type { MessageEnvelope } from "../types/message.js";

// FR3 — §9.3. UDP preserves message boundaries, so NO length-prefix framing.
// One datagram = one envelope.

export class DatagramTooLargeError extends Error {
  constructor(size: number) {
    super(
      `Encoded envelope is ${size} bytes, exceeding MAX_DATAGRAM_BYTES (${MAX_DATAGRAM_BYTES}). ` +
        `Rejected at send, not fragmented (BR-11, A3.3).`,
    );
    this.name = "DatagramTooLargeError";
  }
}

// BR-08 — a multicast envelope carries a TTL. Where the sender sets none,
// DEFAULT_TTL_UNSUPPORTED_ASSUMPTION applies.
export function stampTtl(envelope: MessageEnvelope): MessageEnvelope {
  return {
    ...envelope,
    ttl: envelope.ttl ?? DEFAULT_TTL_UNSUPPORTED_ASSUMPTION,
  };
}

export function encodeDatagram(envelope: MessageEnvelope): Buffer {
  const buf = Buffer.from(JSON.stringify(envelope), "utf8");
  if (buf.length > MAX_DATAGRAM_BYTES) {
    throw new DatagramTooLargeError(buf.length); // BR-11 — reject, do not fragment
  }
  return buf;
}

export function decodeDatagram(buf: Buffer): MessageEnvelope {
  return JSON.parse(buf.toString("utf8")) as MessageEnvelope;
}

// BR-09 — a received multicast envelope with ttl <= 0 is not passed to the
// application layer. This is the exact boundary COND-19 tests.
export function isTtlExpired(envelope: MessageEnvelope): boolean {
  return typeof envelope.ttl === "number" && envelope.ttl <= 0;
}
