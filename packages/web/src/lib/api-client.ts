const BASE = "/api";

async function req<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface AgentDescriptor {
  agentId: string;
  role: string;
  status: string;
  unicastPort: number;
  ipcPort: number;
  architectureMode: string;
  memberships: string[];
}

export const api = {
  agents: () => req<AgentDescriptor[]>("/agents", "GET"),
  spawnDemo: () => req("/admin/spawn-demo", "POST").catch(() => undefined),
  killAgent: (id: string) => req<void>(`/agents/${id}`, "DELETE"),
  setArchitecture: (id: string, architectureMode: string) =>
    req(`/agents/${id}/architecture`, "PATCH", { architectureMode }),
  sendUnicast: (b: { senderId: string; recipientId: string; body: string; encrypted: boolean }) =>
    req<{ envelopeId: string }>("/messages/unicast", "POST", b),
  sendMulticast: (b: { senderId: string; groupAddress: string; port?: number; body: string; ttl?: number; encrypted: boolean }) =>
    req("/messages/multicast", "POST", b),
  sendBroadcast: (b: { senderId: string; body: string }) =>
    req<{ addressUsed?: string }>("/messages/broadcast", "POST", b),
  log: (q = "") => req<Array<Record<string, unknown>>>(`/messages/log${q}`, "GET"),
  join: (g: string, agentId: string) => req(`/groups/${g}/join`, "POST", { agentId }),
  leave: (g: string, agentId: string) => req(`/groups/${g}/leave`, "POST", { agentId }),
  leaveThenInject: (g: string, agentId: string, injectFrom: string) =>
    req(`/groups/${g}/leave-then-inject`, "POST", { agentId, injectFrom }),
  members: (g: string) => req<{ members: string[] }>(`/groups/${g}/members`, "GET"),
  configGroup: (g: string, agentId: string, port: number) =>
    req(`/groups/${g}/config`, "PATCH", { agentId, port }),
  requestKey: (requestingAgentId: string, groupAddress: string) =>
    req("/keys/request", "POST", { requestingAgentId, groupAddress }),
  allowlist: (g: string) => req<{ allowList: string[] }>(`/keys/${g}/allowlist`, "GET"),
  setReliability: (dropRate: number) => req("/admin/reliability", "PATCH", { dropRate }),
  setBroadcastPermission: (simulateDenied: boolean) =>
    req("/admin/broadcast-permission", "PATCH", { simulateDenied }),
  setDefaultTtl: (defaultTtl: number) => req("/admin/default-ttl", "PATCH", { defaultTtl }),
  preconditions: () => req<Record<string, unknown>>("/admin/preconditions", "GET"),
  crypto: () => req<Record<string, unknown>>("/admin/crypto", "GET"),
};
