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
//
// AI ASSUMPTION A4.1 — Design decision (SRS names no address).
// Limited broadcast 255.255.255.255 is taken to satisfy "all possible hosts
// under the same local network," with a subnet-directed fallback (BR-12).
//
// AI ASSUMPTION A4.2 — classified UNSUPPORTED in the Part 1 report.
// We assume the dev/test machines permit broadcast without administrator
// restriction. SRS 2.4.4 states the opposite may hold; when it does, the
// EACCES/EPERM path below surfaces BROADCAST_PERMISSION_DENIED (BR-13).

export interface BroadcastDeps {
  agentId: string;
  port: number;
  emit: Emit;
  onEnvelope: (env: MessageEnvelope) => void;
}

// BR-12 — the subnet-directed fallback address of the active interface, used
// where the OS will not route the limited broadcast. Exported for unit testing.
export function subnetDirectedAddress(): string | null {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      const addr = iface.address.split(".").map(Number);
      const mask = iface.netmask.split(".").map(Number);
      if (addr.length !== 4 || mask.length !== 4) continue;
      return addr.map((o, i) => o | (~mask[i]! & 0xff)).join(".");
    }
  }
  /* v8 ignore next -- only on a host with no non-loopback IPv4 interface */
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
      /* v8 ignore start -- OS-broadcast-failure arm: needs the kernel to reject
         255.255.255.255 (or EACCES as non-root), which cannot be induced
         deterministically. handlePermissionError is covered via the simulate
         toggle; BR-12's subnet fallback is exercised in the demo on macOS/Windows. */
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        return this.handlePermissionError(err as NodeJS.ErrnoException);
      }
      const fallback = subnetDirectedAddress();
      if (!fallback) throw err;
      await trySend(fallback);
      this.emitSent(env, fallback);
      return { addressUsed: fallback };
      /* v8 ignore stop */
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
