import type { AgentDescriptor, GroupConfig, LiveEvent } from "@agentmom/core";
import type { AgentConfig } from "@agentmom/agent/config";
import type { AgentSupervisor } from "./agent-supervisor.js";

// Demo topology — §7.2. Mirrors SRS Figures 1–4.
export const DEMO_GROUPS: Record<string, GroupConfig> = {
  "239.1.1.5": { groupAddress: "239.1.1.5", port: 5007 },
  "239.1.1.6": { groupAddress: "239.1.1.6", port: 5008 },
};

export const BROADCAST_PORT = 9001;

export interface DemoAgentSpec {
  agentId: string;
  role: AgentConfig["role"];
  unicastPort: number;
  ipcPort: number;
  groupsAtStart: string[];
  architectureMode: AgentConfig["architectureMode"];
}

export const DEMO_TOPOLOGY: DemoAgentSpec[] = [
  { agentId: "agent-A", role: "standard", unicastPort: 7001, ipcPort: 8001, groupsAtStart: [], architectureMode: "agent-controlled" },
  { agentId: "agent-B", role: "standard", unicastPort: 7002, ipcPort: 8002, groupsAtStart: ["239.1.1.5"], architectureMode: "agent-controlled" },
  { agentId: "agent-C", role: "standard", unicastPort: 7003, ipcPort: 8003, groupsAtStart: ["239.1.1.5", "239.1.1.6"], architectureMode: "component-controlled" },
  { agentId: "agent-D", role: "key-holder", unicastPort: 7004, ipcPort: 8004, groupsAtStart: ["239.1.1.5"], architectureMode: "agent-controlled" },
];

// CON-08 — exactly one key holder per topology, maintains an allow-list.
// Allow-list ≠ current membership (§9.6): agent-B is a member but deliberately
// NOT allow-listed, so COND-42's denial has a target.
export const DEMO_ALLOWLIST: Record<string, string[]> = {
  "239.1.1.5": ["agent-C", "agent-D"],
  "239.1.1.6": ["agent-C", "agent-D"],
};

export class AgentRegistry {
  private readonly memberships = new Map<string, Set<string>>(); // agentId -> groups
  private readonly architecture = new Map<string, AgentConfig["architectureMode"]>();

  constructor(private readonly supervisor: AgentSupervisor) {}

  applyEvent(event: LiveEvent): void {
    const agentId = event.payload["agentId"] as string | undefined;
    if (!agentId) return;
    if (event.type === "ARCHITECTURE_SWITCHED") {
      this.architecture.set(agentId, event.payload["architectureMode"] as AgentConfig["architectureMode"]);
    }
  }

  seed(spec: DemoAgentSpec): void {
    this.memberships.set(spec.agentId, new Set(spec.groupsAtStart));
    this.architecture.set(spec.agentId, spec.architectureMode);
  }

  setMembership(agentId: string, groups: string[]): void {
    this.memberships.set(agentId, new Set(groups));
  }

  descriptors(): AgentDescriptor[] {
    return this.supervisor.list().map((c) => ({
      agentId: c.agentId,
      role: c.role,
      status: "running",
      unicastPort: c.unicastPort,
      ipcPort: c.ipcPort,
      architectureMode: this.architecture.get(c.agentId) ?? c.architectureMode,
      memberships: [...(this.memberships.get(c.agentId) ?? new Set())],
    }));
  }

  membersOf(groupAddress: string): string[] {
    return [...this.memberships.entries()]
      .filter(([, groups]) => groups.has(groupAddress))
      .map(([id]) => id);
  }
}
