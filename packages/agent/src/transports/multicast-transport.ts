import dgram from "node:dgram";
import {
  DEFAULT_TTL_UNSUPPORTED_ASSUMPTION,
  decodeDatagram,
  encodeDatagram,
  isMulticastAddress,
  stampTtl,
  type MessageEnvelope,
} from "@agentmom/core";
import { MULTICAST_INTERFACE } from "../config.js";
import { makeEvent, type Emit } from "../events.js";
import { classifyMulticastInbound } from "./multicast-inbound.js";
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
          /* v8 ignore next -- addMembership fails only when the OS/NIC lacks multicast (CON-04) */
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
    /* v8 ignore next 3 -- dropMembership throws only if the OS already dropped it */
    try {
      gs.socket.dropMembership(groupAddress, MULTICAST_INTERFACE);
    } catch {
      /* already gone */
    }
    await new Promise<void>((resolve) => gs.socket.close(() => resolve()));
  }

  /** Socket `message` callback → pure classification → emit + dispatch. */
  receive(socketGroup: string, buf: Buffer): void {
    let env: MessageEnvelope | null = null;
    try {
      env = decodeDatagram(buf);
    } catch {
      /* env stays null → classified as "malformed" */
    }
    const v = classifyMulticastInbound(env, socketGroup, this.deps.membership.isDeliverable(socketGroup));
    const agentId = this.deps.agentId;

    switch (v.kind) {
      case "malformed":
        return this.deps.emit(makeEvent("MESSAGE_MALFORMED", { reason: "UNPARSEABLE_DATAGRAM", agentId }));
      case "dropped-membership":
        return this.deps.emit(makeEvent("MESSAGE_DROPPED_MEMBERSHIP", { groupAddress: socketGroup, envelopeId: env!.id, agentId }));
      case "protocol-violation":
        return this.deps.emit(makeEvent("PROTOCOL_VIOLATION", { reason: "GROUP_ADDRESS_MISMATCH", socketGroup, envelopeGroup: v.envelopeGroup, agentId }));
      case "ttl-expired":
        return this.deps.emit(makeEvent("MESSAGE_DROPPED_TTL_EXPIRED", { groupAddress: socketGroup, ttl: v.ttl, envelopeId: env!.id, agentId }));
      case "deliver":
        this.deps.emit(makeEvent("MESSAGE_RECEIVED", {
          mode: "multicast", groupAddress: socketGroup, envelopeId: v.envelope.id,
          senderId: v.envelope.senderId, encrypted: v.envelope.encrypted, agentId,
        }));
        return this.deps.onEnvelope(v.envelope, socketGroup);
    }
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

    // Level 1 TTL — the real OS hop-count control, matching SRS §1.3. The
    // level-2 receiver-side check (A3.2 — a different mechanism, a deliberate
    // divergence from §1.3) lives in `classifyMulticastInbound`.
    const existing = this.sockets.get(groupAddress)?.socket;
    const sender = existing ?? dgram.createSocket({ type: "udp4", reuseAddr: true });
    const ephemeral = !existing;
    if (ephemeral) {
      // A socket must be bound before setMulticastInterface on Linux (EBADF otherwise).
      await new Promise<void>((resolve) => sender.bind(0, () => resolve()));
    }
    /* v8 ignore next 3 -- setMulticastInterface throws only where the loopback iface has no multicast (CON-04) */
    try {
      sender.setMulticastInterface(MULTICAST_INTERFACE);
    } catch {
      /* interface selection unavailable on this host — CON-04 */
    }
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
