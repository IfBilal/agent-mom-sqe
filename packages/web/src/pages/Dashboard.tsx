import { useEffect, useState } from "react";
import { api } from "../lib/api-client";
import { AgentTopologyGraph } from "../components/AgentTopologyGraph";
import { MessageLog } from "../components/MessageLog";
import type { PageProps } from "./types";

export function Dashboard({ agents, events, refresh }: PageProps) {
  const [pre, setPre] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.preconditions().then(setPre).catch(() => setPre(null));
  }, []);

  return (
    <div>
      <h2>Dashboard <span className="req">all requirements</span></h2>
      <div className="row tight" style={{ margin: "10px 0" }}>
        <button className="btn" onClick={() => api.spawnDemo().then(refresh)}>Spawn demo topology (agent-A…D)</button>
        <button className="btn secondary" onClick={refresh}>Refresh</button>
      </div>

      <div className="card note">
        <strong>Precondition banner — CON-04 / CON-05</strong>
        <pre className="readout">{pre ? JSON.stringify(pre, null, 2) : "…"}</pre>
        <p className="muted">
          Authoritative check is <code>scripts/verify-preconditions.sh</code>, run before any test
          session. This test bed is a single host — LAN-scale multicast / broadcast scope is not
          verifiable here (TC-08 / TC-11 territory).
        </p>
      </div>

      <h3>Agent topology</h3>
      <AgentTopologyGraph agents={agents} events={events} />

      <h3>Aggregated event log</h3>
      <MessageLog events={events} />
    </div>
  );
}
