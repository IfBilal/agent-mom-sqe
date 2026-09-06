import { randomUUID } from "node:crypto";
import {
  isMulticastAddress,
  isKeyRequest,
  type DecryptedPayload,
  type MessageEnvelope,
} from "@agentmom/core";
import { BROADCAST_PORT, type AgentConfig } from "./config.js";
import { makeEvent, type Emit } from "./events.js";
import { send, type AgentCommand, type ControlToAgent } from "./ipc.js";
import { UnicastTransport } from "./transports/unicast-transport.js";
import { MulticastTransport } from "./transports/multicast-transport.js";
import { BroadcastTransport } from "./transports/broadcast-transport.js";
import { GroupMembershipManager } from "./membership/group-membership-manager.js";
import { UnicastSecurity, DecryptionFailed, MalformedEnvelope } from "./security/unicast-security.js";
import { MulticastSecurity } from "./security/multicast-security.js";
import { KeyHolderAgent } from "./key-holder/key-holder-agent.js";
import { AgentControlledHandler } from "./architecture/agent-controlled.js";
import { ComponentControlledHandler } from "./architecture/component-controlled.js";
import type { ConversationHandler } from "./architecture/conversation-handler.js";
import { AgentMom1_2Adapter } from "./legacy/agentmom-1_2-adapter.js";
import { BestEffortSimulator } from "./reliability/best-effort-simulator.js";

class Agent {
  private seqCounters = new Map<string, number>();
  private membership = new GroupMembershipManager();
  private simulator = new BestEffortSimulator();
  private unicast!: UnicastTransport;
  private multicast!: MulticastTransport;
  private broadcast!: BroadcastTransport;
  private unicastSec!: UnicastSecurity;
  private multicastSec = new MulticastSecurity();
  private keyHolder: KeyHolderAgent | null = null;
  private legacy!: AgentMom1_2Adapter;
  private handler!: ConversationHandler;

  private readonly emit: Emit = (event) => send({ type: "event", event });

  constructor(private readonly config: AgentConfig) {}

  private nextSeq(key: string): number {
    const n = (this.seqCounters.get(key) ?? 0) + 1;
    this.seqCounters.set(key, n);
    return n;
  }

  private groupPort(groupAddress: string): number {
    return this.config.groups[groupAddress]?.port ?? BROADCAST_PORT;
  }

  async start(): Promise<void> {
    this.unicast = new UnicastTransport({
      agentId: this.config.agentId,
      unicastPort: this.config.unicastPort,
      peers: this.config.peers,
      emit: this.emit,
      onEnvelope: (env) => this.onUnicast(env),
    });
    this.multicast = new MulticastTransport({
      agentId: this.config.agentId,
      membership: this.membership,
      emit: this.emit,
      onEnvelope: (env, group) => this.onMulticast(env, group),
      groupPort: (g) => this.groupPort(g),
    });
    this.broadcast = new BroadcastTransport({
      agentId: this.config.agentId,
      port: this.config.broadcastPort,
      emit: this.emit,
      onEnvelope: (env) => this.onBroadcast(env),
    });
    this.unicastSec = new UnicastSecurity(this.config.agentId, this.config.seed);
    this.legacy = new AgentMom1_2Adapter(this.config.agentId, this.unicast);
    this.handler =
      this.config.architectureMode === "component-controlled"
        ? new ComponentControlledHandler()
        : new AgentControlledHandler();

    if (this.config.role === "key-holder") {
      this.keyHolder = new KeyHolderAgent(this.config.allowList ?? {});
    }

    await this.unicast.listen();
    await this.broadcast.listen();
    for (const group of this.config.groupsAtStart) {
      await this.multicast.join(group, this.groupPort(group));
      // Key holder co-located with the group can seed its own key locally.
      if (this.keyHolder) {
        this.keyHolder.ensureGroup(group);
        const own = this.keyHolder.ownKey(group);
        if (own) this.multicastSec.storeKey(group, own);
      }
    }

    send({ type: "ready", agentId: this.config.agentId });
    this.emit(makeEvent("AGENT_STATUS", { agentId: this.config.agentId, status: "running" }));
  }

  // ---- inbound ----

  private parsePayload(plaintext: string): DecryptedPayload {
    const parsed = JSON.parse(plaintext) as Partial<DecryptedPayload>;
    return { kind: parsed.kind ?? "system", body: parsed.body ?? {} };
  }

  private onUnicast(env: MessageEnvelope): void {
    let plaintext: string;
    try {
      plaintext = this.unicastSec.decryptInbound(env); // BR-15 auto-decrypt
    } catch (err) {
      if (err instanceof MalformedEnvelope) {
        this.emit(makeEvent("MESSAGE_MALFORMED", { envelopeId: env.id, reason: err.message }));
      } else if (err instanceof DecryptionFailed) {
        // BR-17 — fail closed, deliver nothing.
        this.emit(makeEvent("DECRYPTION_FAILED", { envelopeId: env.id, senderId: env.senderId }));
      }
      return;
    }

    this.emit(
      makeEvent("MESSAGE_RECEIVED", {
        mode: "unicast",
        envelopeId: env.id,
        senderId: env.senderId,
        recipientId: env.recipientId,
        encrypted: env.encrypted,
        agentId: this.config.agentId,
      }),
    );

    const payload = this.parsePayload(plaintext);

    // FR6 key-holder protocol (BR-18/BR-19).
    if (payload.kind === "system" && isKeyRequest(payload.body) && this.keyHolder) {
      this.serveKeyRequest(env.senderId, payload.body.groupAddress);
      return;
    }
    if (payload.kind === "system" && payload.body["action"] === "GROUP_KEY_GRANTED") {
      this.multicastSec.storeKey(
        payload.body["groupAddress"] as string,
        payload.body["groupKeyBase64"] as string,
      );
      this.emit(makeEvent("GROUP_KEY_GRANTED", { agentId: this.config.agentId, groupAddress: payload.body["groupAddress"] }));
      return;
    }
    if (payload.kind === "system" && payload.body["action"] === "GROUP_KEY_DENIED") {
      this.emit(makeEvent("GROUP_KEY_DENIED", { agentId: this.config.agentId, groupAddress: payload.body["groupAddress"], reason: payload.body["reason"] }));
      return;
    }

    if (payload.kind === "chat" && (payload.body as { legacy?: boolean }).legacy) {
      this.legacy.deliver(env.senderId, String((payload.body as { text?: string }).text ?? ""));
    }

    this.dispatch(env, payload);
  }

  private serveKeyRequest(requestingAgentId: string, groupAddress: string): void {
    const grant = this.keyHolder!.handleRequest(requestingAgentId, groupAddress);
    const body = grant.granted
      ? { action: "GROUP_KEY_GRANTED", groupAddress, groupKeyBase64: grant.groupKeyBase64 }
      : { action: "GROUP_KEY_DENIED", groupAddress, reason: grant.reason };
    this.emit(
      makeEvent(grant.granted ? "GROUP_KEY_GRANTED" : "GROUP_KEY_DENIED", {
        keyHolder: this.config.agentId,
        requestingAgentId,
        groupAddress,
        reason: grant.reason,
      }),
    );
    // BR-19 — key response is ALWAYS encrypted, overriding BR-14.
    void this.sendUnicast(requestingAgentId, { kind: "system", body }, true);
  }

  private onMulticast(env: MessageEnvelope, group: string): void {
    let plaintext: string;
    try {
      plaintext = this.multicastSec.decryptInbound(env);
    } catch {
      this.emit(makeEvent("DECRYPTION_FAILED", { envelopeId: env.id, groupAddress: group, agentId: this.config.agentId }));
      return;
    }
    this.dispatch(env, this.parsePayload(plaintext));
  }

  private onBroadcast(env: MessageEnvelope): void {
    this.dispatch(env, this.parsePayload(env.payload));
  }

  private dispatch(envelope: MessageEnvelope, payload: DecryptedPayload): void {
    this.handler.handleIncoming(envelope, payload, {
      agentId: this.config.agentId,
      reply: (recipientId, p, encrypted) => void this.sendUnicast(recipientId, p, encrypted),
      emit: (type, detail) => this.emit(makeEvent("AGENT_STATUS", { conversation: type, ...detail })),
    });
  }

  // ---- outbound ----

  private buildEnvelope(
    mode: MessageEnvelope["mode"],
    fields: Partial<MessageEnvelope>,
    payload: DecryptedPayload,
  ): MessageEnvelope {
    const seqKey = `${this.config.agentId}->${fields.recipientId ?? fields.groupAddress ?? "bcast"}`;
    return {
      id: randomUUID(),
      mode,
      senderId: this.config.agentId,
      sequenceNumber: this.nextSeq(seqKey),
      timestampSentMs: Date.now(),
      encrypted: false,
      payload: JSON.stringify(payload),
      ...fields,
    };
  }

  private async sendUnicast(recipientId: string, payload: DecryptedPayload, encrypted: boolean): Promise<void> {
    let env = this.buildEnvelope("unicast", { recipientId }, payload);
    if (encrypted) env = this.unicastSec.encryptOutbound(env);
    await this.unicast.sendUnicast(env);
  }

  private async handleCommand(cmd: AgentCommand): Promise<unknown> {
    switch (cmd.kind) {
      case "send-unicast":
        await this.sendUnicast(cmd.recipientId, toPayload(cmd.body), cmd.encrypted);
        return { ok: true };
      case "send-multicast": {
        if (this.simulator.shouldDrop("multicast")) {
          this.emit(makeEvent("MESSAGE_DROPPED_SIMULATED", { mode: "multicast", groupAddress: cmd.groupAddress }));
          return { dropped: true };
        }
        let env = this.buildEnvelope("multicast", { groupAddress: cmd.groupAddress, ttl: cmd.ttl }, toPayload(cmd.body));
        if (cmd.encrypted) env = this.multicastSec.encryptOutbound(env);
        await this.multicast.sendMulticast(cmd.groupAddress, cmd.port, env);
        return { ok: true };
      }
      case "send-broadcast": {
        if (this.simulator.shouldDrop("broadcast")) {
          this.emit(makeEvent("MESSAGE_DROPPED_SIMULATED", { mode: "broadcast" }));
          return { dropped: true };
        }
        const env = this.buildEnvelope("broadcast", {}, toPayload(cmd.body));
        return this.broadcast.sendBroadcast(env);
      }
      case "join":
        await this.multicast.join(cmd.groupAddress, this.groupPort(cmd.groupAddress));
        return { state: this.membership.stateOf(cmd.groupAddress) };
      case "leave":
        this.membership.leaveSync(cmd.groupAddress); // BR-06 — synchronous first
        await this.multicast.leave(cmd.groupAddress);
        this.keyHolder?.onLeave(this.config.agentId, cmd.groupAddress); // BR-20 — no-op
        return { state: this.membership.stateOf(cmd.groupAddress) };
      case "leave-then-inject": {
        // TC-05 / BR-06 — leave and an inbound multicast within the same tick.
        this.membership.leaveSync(cmd.groupAddress);
        const env = this.buildEnvelope("multicast", { groupAddress: cmd.groupAddress, senderId: cmd.injectFrom, ttl: 5 }, { kind: "chat", body: { text: "post-leave" } });
        await this.multicast.sendMulticast(cmd.groupAddress, undefined, env);
        await this.multicast.leave(cmd.groupAddress);
        return { state: this.membership.stateOf(cmd.groupAddress) };
      }
      case "config-group":
        this.config.groups[cmd.groupAddress] = { groupAddress: cmd.groupAddress, port: cmd.port };
        return { groupAddress: cmd.groupAddress, port: cmd.port };
      case "set-architecture": {
        // A7.2 — replace only the handler, never the sockets.
        this.handler =
          cmd.architectureMode === "component-controlled"
            ? new ComponentControlledHandler()
            : new AgentControlledHandler();
        this.config.architectureMode = cmd.architectureMode;
        this.emit(makeEvent("ARCHITECTURE_SWITCHED", { agentId: this.config.agentId, architectureMode: cmd.architectureMode }));
        return { architectureMode: cmd.architectureMode };
      }
      case "request-group-key": {
        if (!isMulticastAddress(cmd.groupAddress)) throw new Error("bad group address");
        const keyHolderId = Object.keys(this.config.peers).find((id) => id === "agent-D") ?? "agent-D";
        await this.sendUnicast(
          keyHolderId,
          { kind: "system", body: { action: "REQUEST_GROUP_KEY", groupAddress: cmd.groupAddress, requestingAgentId: this.config.agentId } },
          true, // BR-19 — always encrypted
        );
        return { requested: true };
      }
      case "set-drop-rate":
        this.simulator.setDropRate(cmd.dropRate);
        return { dropRate: this.simulator.getDropRate() };
      case "set-broadcast-denied":
        this.broadcast.setSimulateDenied(cmd.simulateDenied);
        return { simulateDenied: cmd.simulateDenied };
      case "set-default-ttl":
        this.multicast.setDefaultTtl(cmd.defaultTtl);
        return { defaultTtl: cmd.defaultTtl };
      case "legacy-send":
        await this.legacy.sendMessage(cmd.toAgentId, cmd.body);
        return { ok: true };
      case "snapshot":
        return {
          agentId: this.config.agentId,
          role: this.config.role,
          architectureMode: this.config.architectureMode,
          memberships: this.membership.joined(),
          allowList: this.keyHolder
            ? Object.fromEntries(
                Object.keys(this.config.groups).map((g) => [g, this.keyHolder!.allowListFor(g)]),
              )
            : undefined,
        };
      default:
        throw new Error(`unknown command`);
    }
  }

  async onMessage(msg: ControlToAgent): Promise<void> {
    if (msg.type === "peer-update") {
      this.config.peers = msg.peers;
      this.unicast.updatePeers(msg.peers);
      return;
    }
    if (msg.type === "cmd") {
      try {
        const data = await this.handleCommand(msg.cmd);
        send({ type: "cmd-result", id: msg.id, ok: true, data });
      } catch (err) {
        send({ type: "cmd-result", id: msg.id, ok: false, error: (err as Error).message });
      }
    }
  }

  async stop(): Promise<void> {
    await this.unicast.close();
    await this.multicast.closeAll();
    await this.broadcast.close();
  }
}

function toPayload(body: unknown): DecryptedPayload {
  if (body && typeof body === "object" && "kind" in body) return body as DecryptedPayload;
  return { kind: "chat", body: { text: String(body ?? "") } };
}

// ---- child-process bootstrap ----
let agent: Agent | null = null;

process.on("message", async (raw: ControlToAgent) => {
  if (raw.type === "init") {
    agent = new Agent(raw.config);
    await agent.start();
    return;
  }
  await agent?.onMessage(raw);
});

process.on("SIGTERM", async () => {
  await agent?.stop();
  process.exit(0);
});

// If the control plane (our IPC parent) goes away, do not linger as an orphan
// holding a unicast/multicast/broadcast port.
process.on("disconnect", async () => {
  await agent?.stop();
  process.exit(0);
});
