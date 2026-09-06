import { isTtlExpired, type MessageEnvelope } from "@agentmom/core";

// Pure classification of an inbound multicast datagram — the FR2/FR3 receive
// rules (BR-04/05 membership gate, §9.2 group cross-check, BR-09 app-level TTL),
// factored out of the socket callback so every branch is unit-testable without
// a live multicast group.

export type MulticastInboundVerdict =
  | { kind: "malformed" }
  | { kind: "dropped-membership" }
  | { kind: "protocol-violation"; envelopeGroup: string }
  | { kind: "ttl-expired"; ttl: number | undefined }
  | { kind: "deliver"; envelope: MessageEnvelope };

export function classifyMulticastInbound(
  envelope: MessageEnvelope | null,
  socketGroup: string,
  isDeliverable: boolean,
): MulticastInboundVerdict {
  // decodeDatagram failure is signalled by a null envelope
  if (envelope === null) return { kind: "malformed" };

  // BR-04 / BR-05 — the application-level set may already reject while the OS
  // still delivers (the BR-06 window).
  if (!isDeliverable) return { kind: "dropped-membership" };

  // §9.2 — the envelope's groupAddress must match the socket's group.
  if (envelope.groupAddress && envelope.groupAddress !== socketGroup) {
    return { kind: "protocol-violation", envelopeGroup: envelope.groupAddress };
  }

  // BR-09 — application-level TTL check (A3.2).
  if (isTtlExpired(envelope)) return { kind: "ttl-expired", ttl: envelope.ttl };

  return { kind: "deliver", envelope };
}
