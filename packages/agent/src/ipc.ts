import type { LiveEvent } from "@agentmom/core";
import type { AgentConfig, PeerAddress } from "./config.js";

// Agent ↔ control-plane IPC contract. The forked child talks to its supervisor
// over Node's built-in `process.send` channel (§5.2 agent process model).

export type ControlToAgent =
  | { type: "init"; config: AgentConfig }
  | { type: "peer-update"; peers: Record<string, PeerAddress> }
  | { type: "cmd"; id: string; cmd: AgentCommand };

export type AgentCommand =
  | { kind: "send-unicast"; recipientId: string; body: unknown; encrypted: boolean }
  | { kind: "send-multicast"; groupAddress: string; port?: number; body: unknown; ttl?: number; encrypted: boolean }
  | { kind: "send-broadcast"; body: unknown }
  | { kind: "join"; groupAddress: string }
  | { kind: "leave"; groupAddress: string }
  | { kind: "leave-then-inject"; groupAddress: string; injectFrom: string } // TC-05 / BR-06
  | { kind: "config-group"; groupAddress: string; port: number }
  | { kind: "set-architecture"; architectureMode: AgentConfig["architectureMode"] }
  | { kind: "request-group-key"; groupAddress: string }
  | { kind: "set-drop-rate"; dropRate: number }
  | { kind: "set-broadcast-denied"; simulateDenied: boolean }
  | { kind: "set-default-ttl"; defaultTtl: number }
  | { kind: "legacy-send"; toAgentId: string; body: string }
  | { kind: "snapshot" };

export type AgentToControl =
  | { type: "ready"; agentId: string }
  | { type: "event"; event: LiveEvent }
  | { type: "cmd-result"; id: string; ok: boolean; data?: unknown; error?: string };

export function send(msg: AgentToControl): void {
  process.send?.(msg);
}
