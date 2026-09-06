import { randomUUID } from "node:crypto";
import type { MessageEnvelope } from "@agentmom/core";
import type { UnicastTransport } from "../transports/unicast-transport.js";

// BR-22 / A8.1 — DO NOT MODIFY THESE SIGNATURES.
// New capability is added ALONGSIDE this interface, never by changing it.
// A8.2 (UNSUPPORTED): this surface is OUR reconstruction from SRS §2.2.
// No agentMom 1.2 artifact was available, and this implementation is not on
// the JVM the SRS specifies (2.1/2.1.1, CON-09). It therefore CANNOT
// evidence real compatibility. See Part 3A limitation column.
export interface AgentMom1_2 {
  sendMessage(toAgentId: string, body: string): Promise<void>;
  onMessage(handler: (fromAgentId: string, body: string) => void): void;
}

// Thin wrapper over the new unicast transport with `encrypted: false` hardcoded
// (1.2 predates FR5). The legacy path has no branch that new features can break,
// because it is a strict subset wrapper — that is the honest claim, and it is
// the only one available.
export class AgentMom1_2Adapter implements AgentMom1_2 {
  private handler: ((fromAgentId: string, body: string) => void) | null = null;
  private seq = 0;

  constructor(
    private readonly agentId: string,
    private readonly transport: UnicastTransport,
  ) {}

  async sendMessage(toAgentId: string, body: string): Promise<void> {
    const env: MessageEnvelope = {
      id: randomUUID(),
      mode: "unicast",
      senderId: this.agentId,
      recipientId: toAgentId,
      sequenceNumber: ++this.seq,
      timestampSentMs: Date.now(),
      encrypted: false, // hardcoded — 1.2 predates FR5
      payload: JSON.stringify({ kind: "chat", body: { text: body, legacy: true } }),
    };
    await this.transport.sendUnicast(env);
  }

  onMessage(handler: (fromAgentId: string, body: string) => void): void {
    this.handler = handler;
  }

  deliver(fromAgentId: string, body: string): void {
    this.handler?.(fromAgentId, body);
  }
}
