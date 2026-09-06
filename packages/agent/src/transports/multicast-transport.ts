import dgram from "node:dgram";
import {
  DEFAULT_TTL_UNSUPPORTED_ASSUMPTION,
  decodeDatagram,
  encodeDatagram,
  isMulticastAddress,
  isTtlExpired,
  stampTtl,
  type MessageEnvelope,
} from "@agentmom/core";
import { MULTICAST_INTERFACE } from "../config.js";
import { makeEvent, type Emit } from "../events.js";
import type { GroupMembershipManager } from "../membership/group-membership-manager.js";

// FR2 + FR3 — §9.2 / §9.3.
//
// Socket per group (A2.2): dgram's `message` event exposes rinfo describing the
// SENDER, not the destination group. Binding one socket per joined group removes
// the attribution ambiguity and makes BR-07 cleanly testable.
//
// Port model (§7.1) — READ THIS: IP multicast delivery is keyed on
// (group address, destination port). All members of a group bind the SAME port.
// Binding a different port receives nothing, with no error.

interface GroupSocket {
  socket: dgram.Socket;
  port: number;
}

export interface MulticastDeps {
  agentId: string;
  membership: GroupMembershipManager;
  emit: Emit;
  onEnvelope: (env: MessageEnvelope, groupAddress: string) => void;
  groupPort: (groupAddress: string) => number;
}

export class MulticastTransport {
  private readonly sockets = new Map<string, GroupSocket>();
  private defaultTtl = DEFAULT_TTL_UNSUPPORTED_ASSUMPTION;

  constructor(private readonly deps: MulticastDeps) {}

  setDefaultTtl(ttl: number): void {
    this.defaultTtl = ttl; // A3.1 demo aid — PATCH /admin/default-ttl
  }

  async join(groupAddress: string, port: number): Promise<void> {
    if (this.sockets.has(groupAddress)) {
      this.deps.membership.completeJoin(groupAddress);
      return;
    }
    this.deps.membership.beginJoin(groupAddress);

    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(port, () => {
        try {
          socket.addMembership(groupAddress, MULTICAST_INTERFACE);
          socket.setMulticastInterface(MULTICAST_INTERFACE);
          // Loopback so a sender's own datagrams return to co-located agents.
          socket.setMulticastLoopback(true);
          resolve();
        } catch (err) {
          reject(err as Error);
        }
      });
    });

    socket.on("message", (buf) => this.receive(groupAddress, buf));
    this.sockets.set(groupAddress, { socket, port });
    this.deps.membership.completeJoin(groupAddress);
  }

  // BR-06 — set update is synchronous (done by the caller via membership.leaveSync
  // BEFORE this), then the OS dropMembership + socket close here.
  async leave(groupAddress: string): Promise<void> {
    const gs = this.sockets.get(groupAddress);
    if (!gs) return;
    this.sockets.delete(groupAddress);
    try {
      gs.socket.dropMembership(groupAddress, MULTICAST_INTERFACE);
    } catch {
      /* already gone */
    }
    await new Promise<void>((resolve) => gs.socket.close(() => resolve()));
  }

  private receive(socketGroup: string, buf: Buffer): void {
    let env: MessageEnvelope;
    try {
      env = decodeDatagram(buf);
    } catch {
      this.deps.emit(makeEvent("MESSAGE_MALFORMED", { reason: "UNPARSEABLE_DATAGRAM" }));
      return;
    }

    // BR-04 / BR-05 — checked against the application-level set, which may
    // already reject while the OS still delivers (the BR-06 window).
    if (!this.deps.membership.isDeliverable(socketGroup)) {
      this.deps.emit(
        makeEvent("MESSAGE_DROPPED_MEMBERSHIP", {
          groupAddress: socketGroup,
          envelopeId: env.id,
          agentId: this.deps.agentId,
        }),
      );
      return;
    }

    // Cross-check §9.2 — the envelope's groupAddress must match the socket group.
    if (env.groupAddress && env.groupAddress !== socketGroup) {
      this.deps.emit(
        makeEvent("PROTOCOL_VIOLATION", {
          reason: "GROUP_ADDRESS_MISMATCH",
          socketGroup,
          envelopeGroup: env.groupAddress,
        }),
      );
      return;
    }

    // BR-09 — application-level TTL check (A3.2). This is NOT SRS §1.3's
    // router-hop TTL; it is a receiver-enforced check that exists only because
    // level-1 setMulticastTTL has no observable effect on a single host.
    if (isTtlExpired(env)) {
      this.deps.emit(
        makeEvent("MESSAGE_DROPPED_TTL_EXPIRED", {
          groupAddress: socketGroup,
          ttl: env.ttl,
          envelopeId: env.id,
        }),
      );
      return;
    }

    this.deps.emit(
      makeEvent("MESSAGE_RECEIVED", {
        mode: "multicast",
        groupAddress: socketGroup,
        envelopeId: env.id,
        senderId: env.senderId,
        encrypted: env.encrypted,
        agentId: this.deps.agentId,
      }),
    );
    this.deps.onEnvelope(env, socketGroup);
  }

  async sendMulticast(
    groupAddress: string,
    portOverride: number | undefined,
    env: MessageEnvelope,
  ): Promise<void> {
    // BR-10 — reject a destination outside 224.0.0.0/4 at send time.
    if (!isMulticastAddress(groupAddress)) {
      throw new Error(`${groupAddress} is outside 224.0.0.0/4 (BR-10)`);
    }
    const port = portOverride ?? this.deps.groupPort(groupAddress);
    const stamped = stampTtl({ ...env, ttl: env.ttl ?? this.defaultTtl });
    const datagram = encodeDatagram(stamped); // BR-11 — throws if too large

    // Level 1 TTL — the real OS hop-count control, matching SRS §1.3.
    const sender = this.sockets.get(groupAddress)?.socket ?? dgram.createSocket({ type: "udp4", reuseAddr: true });
    const ephemeral = !this.sockets.has(groupAddress);
    if (ephemeral) sender.setMulticastInterface(MULTICAST_INTERFACE);
    sender.setMulticastTTL(stamped.ttl ?? this.defaultTtl);

    await new Promise<void>((resolve, reject) => {
      sender.send(datagram, port, groupAddress, (err) => {
        if (ephemeral) sender.close();
        err ? reject(err) : resolve();
      });
    });

    this.deps.emit(
      makeEvent("MESSAGE_SENT", {
        mode: "multicast",
        groupAddress,
        port,
        ttl: stamped.ttl,
        envelopeId: stamped.id,
        senderId: stamped.senderId,
        encrypted: stamped.encrypted,
      }),
    );
  }

  async closeAll(): Promise<void> {
    for (const g of [...this.sockets.keys()]) await this.leave(g);
  }
}
