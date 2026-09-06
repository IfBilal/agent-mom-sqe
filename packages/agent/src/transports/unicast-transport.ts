import net from "node:net";
import {
  FrameDecoder,
  SequenceChecker,
  encodeFrame,
  type MessageEnvelope,
} from "@agentmom/core";
import type { PeerAddress } from "../config.js";
import { makeEvent, type Emit } from "../events.js";

// FR1 — §9.1.
// AI ASSUMPTION A1.1 — Supported by SRS (2.1.2): TCP is the unicast transport.
// Connection model (A1.2): one persistent TCP connection per ORDERED pair,
// lazily established on first send, reused thereafter. TCP guarantees ordering
// per connection — that, and only that, is why BR-02 holds.

export interface UnicastDeps {
  agentId: string;
  unicastPort: number;
  peers: Record<string, PeerAddress>;
  emit: Emit;
  onEnvelope: (env: MessageEnvelope) => void;
}

export class UnicastTransport {
  private server: net.Server | null = null;
  private readonly clients = new Map<string, net.Socket>();
  private readonly seq = new SequenceChecker();

  constructor(private readonly deps: UnicastDeps) {}

  updatePeers(peers: Record<string, PeerAddress>): void {
    this.deps.peers = peers;
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const server = net.createServer((socket) => this.attachInbound(socket));
      server.once("error", reject);
      server.listen(this.deps.unicastPort, "127.0.0.1", () => {
        this.server = server;
        resolve();
      });
    });
  }

  private attachInbound(socket: net.Socket): void {
    const decoder = new FrameDecoder();
    socket.on("data", (chunk) => {
      // A `data` event is NOT a message — it may carry half a frame or three.
      for (const env of decoder.push(chunk)) this.receive(env);
    });
    socket.on("error", () => void 0);
  }

  private receive(env: MessageEnvelope): void {
    // BR-01 (3.2.1.3) — accept only where recipientId equals this agent's ID.
    // Point-to-point TCP makes this nearly unreachable; implement it anyway so
    // 3.2.1.3 is independently demonstrable rather than "true because TCP".
    if (env.recipientId !== this.deps.agentId) {
      this.deps.emit(
        makeEvent("PROTOCOL_VIOLATION", {
          reason: "RECIPIENT_MISMATCH",
          expected: this.deps.agentId,
          got: env.recipientId,
          envelopeId: env.id,
        }),
      );
      return; // dropped and logged
    }

    // BR-02 / BR-03 — verification only. NO resequencing, NO buffering.
    const obs = this.seq.observe(env.senderId, env.recipientId, env.sequenceNumber);
    if (obs.anomaly) {
      this.deps.emit(
        makeEvent("SEQUENCE_ANOMALY", {
          senderId: env.senderId,
          expected: obs.expected,
          received: obs.received,
          envelopeId: env.id,
        }),
      );
    }

    this.deps.onEnvelope(env);
  }

  private async connect(recipientId: string): Promise<net.Socket> {
    const existing = this.clients.get(recipientId);
    if (existing && !existing.destroyed) return existing;

    const peer = this.deps.peers[recipientId];
    if (!peer) throw new Error(`No address book entry for ${recipientId} (CON-06)`);

    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host: peer.host, port: peer.unicastPort }, () => resolve(s));
      s.once("error", reject);
    });
    socket.on("close", () => {
      if (this.clients.get(recipientId) === socket) this.clients.delete(recipientId);
    });
    this.clients.set(recipientId, socket);
    return socket;
  }

  async sendUnicast(env: MessageEnvelope): Promise<void> {
    if (!env.recipientId) throw new Error("unicast envelope requires recipientId (BR-01)");
    // COND-09 — a stopped recipient surfaces a connection error, not a crash.
    const socket = await this.connect(env.recipientId);
    await new Promise<void>((resolve, reject) => {
      socket.write(encodeFrame(env), (err) => (err ? reject(err) : resolve()));
    });
    this.deps.emit(
      makeEvent("MESSAGE_SENT", {
        mode: "unicast",
        envelopeId: env.id,
        senderId: env.senderId,
        recipientId: env.recipientId,
        encrypted: env.encrypted,
      }),
    );
  }

  async close(): Promise<void> {
    for (const s of this.clients.values()) s.destroy();
    this.clients.clear();
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }
}
