import type {
  AgentRole,
  ConversationArchitecture,
  GroupConfig,
} from "@agentmom/core";

export interface PeerAddress {
  host: string;
  unicastPort: number;
}

export interface AgentConfig {
  agentId: string;
  role: AgentRole;
  unicastPort: number;
  ipcPort: number;
  architectureMode: ConversationArchitecture;
  groupsAtStart: string[]; // group addresses joined on boot
  groups: Record<string, GroupConfig>; // groupAddress -> { groupAddress, port }
  broadcastPort: number;
  seed: string; // AGENTMOM_DEMO_SEED — A5.2
  peers: Record<string, PeerAddress>; // agentId -> address (CON-06: seeded by control plane)
  allowList?: Record<string, string[]>; // key-holder only: groupAddress -> [agentId] (CON-08)
}

export const DEMO_GROUPS: Record<string, GroupConfig> = {
  "239.1.1.5": { groupAddress: "239.1.1.5", port: 5007 }, // group α
  "239.1.1.6": { groupAddress: "239.1.1.6", port: 5008 }, // group β
};

export const BROADCAST_PORT = 9001;
export const MULTICAST_INTERFACE = "127.0.0.1"; // single-host demo (CON-04 caveat)
