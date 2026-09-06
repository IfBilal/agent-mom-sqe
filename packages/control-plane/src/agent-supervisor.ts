import { fork, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import type { LiveEvent } from "@agentmom/core";
import type { AgentConfig, PeerAddress } from "@agentmom/agent/config";
import type { AgentCommand, AgentToControl, ControlToAgent } from "@agentmom/agent/ipc";

const require = createRequire(import.meta.url);
const AGENT_ENTRY = require.resolve("@agentmom/agent");

export type EventSink = (event: LiveEvent) => void;

interface Supervised {
  child: ChildProcess;
  config: AgentConfig;
}

export class AgentSupervisor {
  private readonly agents = new Map<string, Supervised>();
  private readonly pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(private readonly sink: EventSink) {}

  list(): AgentConfig[] {
    return [...this.agents.values()].map((s) => s.config);
  }

  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  async spawn(config: AgentConfig): Promise<void> {
    if (this.agents.has(config.agentId)) throw new Error(`agent ${config.agentId} already running`);
    // restart-on-crash is OFF — visible crashes are wanted (Phase 1 notes).
    const child = fork(AGENT_ENTRY, [], { stdio: ["inherit", "inherit", "inherit", "ipc"] });
    this.agents.set(config.agentId, { child, config });

    child.on("message", (msg: AgentToControl) => this.onAgentMessage(config.agentId, msg));
    child.on("exit", (code) => {
      this.agents.delete(config.agentId);
      this.sink({ type: "AGENT_KILLED", payload: { agentId: config.agentId, code }, ts: Date.now() });
    });

    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.off("message", handler);
        reject(new Error(`agent ${config.agentId} did not become ready within 10s`));
      }, 10000);
      const handler = (msg: AgentToControl) => {
        if (msg.type === "ready" && msg.agentId === config.agentId) {
          clearTimeout(timer);
          child.off("message", handler);
          resolve();
        }
      };
      child.on("message", handler);
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`agent ${config.agentId} exited during startup (code ${code})`));
      });
    });

    this.sendRaw(config.agentId, { type: "init", config });
    await ready;
    this.broadcastPeers();
    this.sink({ type: "AGENT_SPAWNED", payload: { agentId: config.agentId, role: config.role }, ts: Date.now() });
  }

  async kill(agentId: string): Promise<void> {
    const s = this.agents.get(agentId);
    if (!s) throw new Error(`agent ${agentId} not found`);
    s.child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        s.child.kill("SIGKILL");
        resolve();
      }, 1500);
      s.child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  async command(agentId: string, cmd: AgentCommand): Promise<unknown> {
    const s = this.agents.get(agentId);
    if (!s) throw new Error(`agent ${agentId} not found`);
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.sendRaw(agentId, { type: "cmd", id, cmd });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`command ${cmd.kind} timed out`));
      }, 8000);
    });
  }

  private onAgentMessage(agentId: string, msg: AgentToControl): void {
    if (msg.type === "event") {
      this.sink({ ...msg.event, payload: { agentId, ...msg.event.payload } });
    } else if (msg.type === "cmd-result") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.ok ? p.resolve(msg.data) : p.reject(new Error(msg.error ?? "command failed"));
    }
  }

  private peerMap(): Record<string, PeerAddress> {
    const peers: Record<string, PeerAddress> = {};
    for (const s of this.agents.values()) {
      peers[s.config.agentId] = { host: "127.0.0.1", unicastPort: s.config.unicastPort };
    }
    return peers;
  }

  private broadcastPeers(): void {
    const peers = this.peerMap();
    for (const agentId of this.agents.keys()) {
      this.sendRaw(agentId, { type: "peer-update", peers });
    }
  }

  private sendRaw(agentId: string, msg: ControlToAgent): void {
    this.agents.get(agentId)?.child.send(msg);
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.agents.keys()].map((id) => this.kill(id)));
  }
}
