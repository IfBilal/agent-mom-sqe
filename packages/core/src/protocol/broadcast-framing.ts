import { Buffer } from "node:buffer";
import { MAX_DATAGRAM_BYTES } from "../constants.js";
import { DatagramTooLargeError } from "./multicast-framing.js";
import type { MessageEnvelope } from "../types/message.js";

// FR4 — §9.4. UDP, message boundaries preserved. No TTL on broadcast envelopes
// (§8 invariant 2: ttl is multicast-only).

export function encodeBroadcast(envelope: MessageEnvelope): Buffer {
  const buf = Buffer.from(JSON.stringify(envelope), "utf8");
  if (buf.length > MAX_DATAGRAM_BYTES) {
    throw new DatagramTooLargeError(buf.length);
  }
  return buf;
}

export function decodeBroadcast(buf: Buffer): MessageEnvelope {
  return JSON.parse(buf.toString("utf8")) as MessageEnvelope;
}
