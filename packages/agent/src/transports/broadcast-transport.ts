import dgram from "node:dgram";
import os from "node:os";
import {
  LIMITED_BROADCAST_ADDRESS,
  decodeBroadcast,
  encodeBroadcast,
  type MessageEnvelope,
} from "@agentmom/core";
import { makeEvent, type Emit } from "../events.js";

// FR4 — §9.4. BR-12, BR-13.
// Wording discipline: a broadcast is "SENT TO" all possible hosts, never
// "reaches" them (NFR9 / 2.4.1 permits delivery to none).

export interface BroadcastDeps {
  agentId: string;
  port: number;
  emit: Emit;
  onEnvelope: (env: MessageEnvelope) => void;
}

function subnetDirectedAddress(): string | null {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      const addr = iface.address.split(".").map(Number);
      const mask = iface.netmask.split(".").map(Number);
      if (addr.length !== 4 || mask.length !== 4) continue;
      return addr.map((o, i) => o | (~mask[i]! & 0xff)).join(".");
    }
  }
  return null;
}

export class BroadcastTransport {
  private socket: dgram.Socket | null = null;
  private simulateDenied = false; // demo aid only — §9.4

  constructor(private readonly deps: BroadcastDeps) {}

  setSimulateDenied(v: boolean): void {
    this.simulateDenied = v;
  }

  async listen(): Promise<void> {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(this.deps.port, () => {
        socket.setBroadcast(true); // after bind — §9.4
        resolve();
      });
    });
    socket.on("message", (buf) => {
      try {
        const env = decodeBroadcast(buf);
        this.deps.emit(
          makeEvent("MESSAGE_RECEIVED", {
            mode: "broadcast",
            envelopeId: env.id,
            senderId: env.senderId,
            agentId: this.deps.agentId,
          }),
        );
        this.deps.onEnvelope(env);
      } catch {
        this.deps.emit(makeEvent("MESSAGE_MALFORMED", { reason: "UNPARSEABLE_BROADCAST" }));
      }
    });
    this.socket = socket;
  }

  async sendBroadcast(env: MessageEnvelope): Promise<{ addressUsed: string }> {
    if (!this.socket) throw new Error("broadcast socket not bound");
    const datagram = encodeBroadcast(env);

    // BR-13 — a simulated permission denial force-throws the same handled path.
    // Hard rule (§9.4): a simulated failure the app handles correctly is a PASS
    // of the error-handling test, NEVER evidence for a FAILED status.
    if (this.simulateDenied) {
      return this.handlePermissionError(
        Object.assign(new Error("EACCES simulated"), { code: "EACCES" }),
      );
    }

    const trySend = (address: string) =>
      new Promise<void>((resolve, reject) => {
        this.socket!.send(datagram, this.deps.port, address, (err) =>
          err ? reject(err) : resolve(),
        );
      });

    try {
      await trySend(LIMITED_BROADCAST_ADDRESS);
      this.emitSent(env, LIMITED_BROADCAST_ADDRESS);
      return { addressUsed: LIMITED_BROADCAST_ADDRESS };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        return this.handlePermissionError(err as NodeJS.ErrnoException);
      }
      // BR-12 — OS did not route the limited broadcast; fall back to the
      // subnet-directed address of the active interface.
      const fallback = subnetDirectedAddress();
      if (!fallback) throw err;
      await trySend(fallback);
      this.emitSent(env, fallback);
      return { addressUsed: fallback };
    }
  }

  private handlePermissionError(err: NodeJS.ErrnoException): { addressUsed: string } {
    this.deps.emit(
      makeEvent("BROADCAST_PERMISSION_DENIED", {
        agentId: this.deps.agentId,
        code: err.code,
        message:
          "Broadcast permission denied by OS/network — see SRS constraint 2.4.4.",
      }),
    );
    return { addressUsed: "NONE_PERMISSION_DENIED" };
  }

  private emitSent(env: MessageEnvelope, addressUsed: string): void {
    this.deps.emit(
      makeEvent("MESSAGE_SENT", {
        mode: "broadcast",
        envelopeId: env.id,
        senderId: env.senderId,
        addressUsed,
      }),
    );
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.socket) return resolve();
      this.socket.close(() => resolve());
    });
    this.socket = null;
  }
}
