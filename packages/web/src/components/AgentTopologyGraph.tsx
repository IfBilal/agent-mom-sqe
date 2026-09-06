import { useEffect, useState } from "react";
import type { LiveEvent } from "../lib/ws-client";
import type { AgentDescriptor } from "../lib/api-client";

// A simple node-per-agent view. Nodes flash when they send or receive.
// Scope honesty (§9.4): a flash on a broadcast evidences HOST-LOCAL reach only.
export function AgentTopologyGraph({ agents, events }: { agents: AgentDescriptor[]; events: LiveEvent[] }) {
  const [active, setActive] = useState<Record<string, number>>({});

  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;
    const id = String(last.payload["agentId"] ?? "");
    if (!id) return;
    setActive((p) => ({ ...p, [id]: Date.now() }));
  }, [events]);

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: 12 }}>
      {agents.map((a) => {
        const hot = Date.now() - (active[a.agentId] ?? 0) < 800;
        return (
          <div
            key={a.agentId}
            style={{
              border: "2px solid",
              borderColor: hot ? "#2e7d32" : "#bbb",
              borderRadius: 8,
              padding: "8px 12px",
              minWidth: 150,
              background: hot ? "#e8f5e9" : "#fff",
            }}
          >
            <strong>{a.agentId}</strong> <small>({a.role})</small>
            <div style={{ fontSize: 12 }}>uc:{a.unicastPort} · {a.architectureMode}</div>
            <div style={{ fontSize: 12 }}>groups: {a.memberships.join(", ") || "—"}</div>
          </div>
        );
      })}
    </div>
  );
}
