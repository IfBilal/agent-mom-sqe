import { useEffect, useState } from "react";
import type { LiveEvent } from "../lib/ws-client";
import type { AgentDescriptor } from "../lib/api-client";

// A node per agent; a node lights up when it sends or receives.
// Scope honesty (§9.4): a flash on a broadcast evidences HOST-LOCAL reach only.
export function AgentTopologyGraph({ agents, events }: { agents: AgentDescriptor[]; events: LiveEvent[] }) {
  const [active, setActive] = useState<Record<string, number>>({});
  const [, tick] = useState(0);

  useEffect(() => {
    const last = events[events.length - 1];
    const id = last ? String(last.payload["agentId"] ?? "") : "";
    if (id) setActive((p) => ({ ...p, [id]: Date.now() }));
  }, [events]);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="node-grid">
      {agents.map((a) => {
        const hot = Date.now() - (active[a.agentId] ?? 0) < 900;
        return (
          <div key={a.agentId} className={`node${hot ? " hot" : ""}`}>
            <div className="name">
              {a.agentId} <span className="muted">· {a.role}</span>
            </div>
            <div className="meta">uc:{a.unicastPort} · {a.architectureMode}</div>
            <div className="meta">groups: {a.memberships.join(", ") || "—"}</div>
          </div>
        );
      })}
    </div>
  );
}
