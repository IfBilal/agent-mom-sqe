import { Buffer } from "node:buffer";
import { FRAME_LENGTH_PREFIX_BYTES } from "../constants.js";
import type { MessageEnvelope } from "../types/message.js";

// FR1 framing — §9.1. TCP is a byte stream, so every envelope is length-prefixed:
// 4-byte big-endian UInt32 length, then UTF-8 JSON.
//
// A `data` event is NOT a message — it may carry half a frame or three frames.
// FrameDecoder buffers partial reads and yields exactly the complete envelopes.
// COND-02 and COND-03 test exactly this.

export function encodeFrame(envelope: MessageEnvelope): Buffer {
  const json = Buffer.from(JSON.stringify(envelope), "utf8");
  const prefix = Buffer.alloc(FRAME_LENGTH_PREFIX_BYTES);
  prefix.writeUInt32BE(json.length, 0);
  return Buffer.concat([prefix, json]);
}

export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  /** Feed raw bytes from a `data` event; returns every complete envelope now available. */
  push(chunk: Buffer): MessageEnvelope[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const out: MessageEnvelope[] = [];

    while (this.buffer.length >= FRAME_LENGTH_PREFIX_BYTES) {
      const length = this.buffer.readUInt32BE(0);
      const total = FRAME_LENGTH_PREFIX_BYTES + length;
      if (this.buffer.length < total) break; // partial frame — wait for more

      const json = this.buffer.subarray(FRAME_LENGTH_PREFIX_BYTES, total).toString("utf8");
      this.buffer = this.buffer.subarray(total);
      out.push(JSON.parse(json) as MessageEnvelope);
    }
    return out;
  }
}

export function decode(frame: Buffer): MessageEnvelope {
  const length = frame.readUInt32BE(0);
  const json = frame.subarray(
    FRAME_LENGTH_PREFIX_BYTES,
    FRAME_LENGTH_PREFIX_BYTES + length,
  ).toString("utf8");
  return JSON.parse(json) as MessageEnvelope;
}
