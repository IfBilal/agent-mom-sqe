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
      <h2>Dashboard — all requirements</h2>
      <button onClick={() => api.spawnDemo().then(refresh)}>Spawn demo topology (agent-A…D)</button>{" "}
      <button onClick={refresh}>Refresh</button>

      <section style={{ border: "1px solid #ddd", padding: 8, margin: "12px 0", background: "#fffef0" }}>
        <strong>Precondition banner (CON-04 / CON-05)</strong>
        <pre style={{ fontSize: 12 }}>{pre ? JSON.stringify(pre, null, 2) : "…"}</pre>
        <small>
          Authoritative check is <code>scripts/verify-preconditions.sh</code>, run before any
          test session. This test bed is a single host — LAN-scale multicast/broadcast scope
          is not verifiable here (TC-08 / TC-11 territory).
        </small>
      </section>

      <AgentTopologyGraph agents={agents} events={events} />
      <h3>Aggregated event log</h3>
      <MessageLog events={events} />
    </div>
  );
}
