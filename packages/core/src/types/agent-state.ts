export type AgentRole = "standard" | "key-holder";
export type ConversationArchitecture = "agent-controlled" | "component-controlled";
export type AgentStatus = "starting" | "running" | "stopped" | "crashed";
export type MembershipState = "NOT_MEMBER" | "JOINING" | "MEMBER";

export interface GroupConfig {
  groupAddress: string;
  port: number;
}

export interface AgentDescriptor {
  agentId: string;
  role: AgentRole;
  status: AgentStatus;
  unicastPort: number;
  ipcPort: number;
  architectureMode: ConversationArchitecture;
  memberships: string[]; // group addresses currently joined
}
