import type { LiveEvent, MessageLogEntry, TransportMode } from "@agentmom/core";

// Aggregates the agent event streams into one chronological log (§10). A shared
// MessageLog supplements — does not replace — per-page feedback in the harness.
export class LogAggregator {
  private readonly entries: MessageLogEntry[] = [];
  private readonly max = 2000;

  ingest(event: LiveEvent): void {
    const p = event.payload;
    const loggable = new Set([
      "MESSAGE_SENT", "MESSAGE_RECEIVED", "MESSAGE_DROPPED_MEMBERSHIP",
      "MESSAGE_DROPPED_TTL_EXPIRED", "MESSAGE_DROPPED_SIMULATED", "MESSAGE_MALFORMED",
      "PROTOCOL_VIOLATION", "DECRYPTION_FAILED", "BROADCAST_PERMISSION_DENIED",
      "SEQUENCE_ANOMALY", "GROUP_KEY_GRANTED", "GROUP_KEY_DENIED", "ARCHITECTURE_SWITCHED",
    ]);
    if (!loggable.has(event.type)) return;

    this.entries.push({
      envelopeId: (p["envelopeId"] as string) ?? "-",
      mode: (p["mode"] as TransportMode) ?? "unicast",
      senderId: (p["senderId"] as string) ?? (p["agentId"] as string) ?? "-",
      recipientId: p["recipientId"] as string | undefined,
      groupAddress: p["groupAddress"] as string | undefined,
      addressUsed: p["addressUsed"] as string | undefined,
      encrypted: Boolean(p["encrypted"]),
      event: event.type,
      detail: JSON.stringify(p),
      ts: event.ts,
    });
    if (this.entries.length > this.max) this.entries.shift();
  }

  query(filter: { agentId?: string; mode?: string; since?: number }): MessageLogEntry[] {
    return this.entries.filter((e) => {
      if (filter.since && e.ts < filter.since) return false;
      if (filter.mode && e.mode !== filter.mode) return false;
      if (filter.agentId && e.senderId !== filter.agentId && e.recipientId !== filter.agentId) return false;
      return true;
    });
  }
}
