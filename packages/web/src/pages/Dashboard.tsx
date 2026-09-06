import { useEffect, useState } from "react";
import { api } from "../lib/api-client";
import { AgentTopologyGraph } from "../components/AgentTopologyGraph";
import { MessageLog } from "../components/MessageLog";
import type { PageProps } from "./types";

interface Preconditions {
  multicast: { available: boolean; scope: string; note: string };
  broadcast: { available: boolean; note: string };
  host: string;
  interfaces: string[];
}

export function Dashboard({ agents, events, refresh }: PageProps) {
  const [pre, setPre] = useState<Preconditions | null>(null);

  useEffect(() => {
    api.preconditions().then((p) => setPre(p as unknown as Preconditions)).catch(() => setPre(null));
  }, []);

  return (
    <div>
      <h2>Dashboard</h2>
      <div className="row tight" style={{ margin: "10px 0" }}>
        <button className="btn" onClick={() => api.spawnDemo().then(refresh)}>Spawn demo topology (agent-A…D)</button>
        <button className="btn secondary" onClick={refresh}>Refresh</button>
      </div>

      <div className="panel note">
        <strong>Network preconditions</strong>
        {pre && (
          <div className="row" style={{ marginTop: 10, gap: 20 }}>
            <div className="stack">
              <span><span className={`pill ${pre.multicast.available ? "member" : "not"}`}>multicast {pre.multicast.available ? "available" : "no"}</span></span>
              <span className="faint">{pre.multicast.note}</span>
            </div>
            <div className="stack">
              <span><span className={`pill ${pre.broadcast.available ? "member" : "not"}`}>broadcast {pre.broadcast.available ? "available" : "no"}</span></span>
              <span className="faint">{pre.broadcast.note}</span>
            </div>
          </div>
        )}
        <p className="muted" style={{ marginBottom: 0 }}>
          Host <code>{pre?.host ?? "…"}</code> · this is a single machine, so network-wide
          multicast / broadcast coverage cannot be verified here. Run{" "}
          <code>scripts/verify-preconditions.sh</code> before a test session.
        </p>
      </div>

      <h3>Agent topology</h3>
      <AgentTopologyGraph agents={agents} events={events} />

      <h3>Aggregated event log</h3>
      <MessageLog events={events} />
    </div>
  );
}
