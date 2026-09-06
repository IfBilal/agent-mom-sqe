import { useState } from "react";
import { api } from "../lib/api-client";
import { StatusBadge } from "../components/StatusBadge";
import { MessageComposer } from "../components/MessageComposer";
import { MessageLog } from "../components/MessageLog";
import { useAction } from "../lib/useAction";
import type { PageProps } from "./types";

// NFR8 — legacy-only send panel that BYPASSES every new-feature control.
// A8.2 (UNSUPPORTED): the AgentMom1_2 surface is our own reconstruction from
// SRS §2.2, on a non-JVM runtime (CON-09). This panel CANNOT evidence real
// compatibility — see the Part 3A limitation column.
export function Compatibility({ agents, events, eventsRef }: PageProps) {
  const [from, setFrom] = useState("agent-A");
  const [to, setTo] = useState("agent-B");
  const { status, run } = useAction(eventsRef, {
    success: ["MESSAGE_RECEIVED"],
    failure: ["PROTOCOL_VIOLATION", "AGENT_KILLED"],
  });

  return (
    <div>
      <h2>Compatibility — NFR8 (agentMom 1.2)</h2>
      <div style={{ border: "1px solid #c62828", background: "#fff5f5", padding: 8, fontSize: 12 }}>
        This evaluation <strong>cannot validate real compatibility</strong>. No agentMom 1.2
        artifact was obtainable and this implementation is not on the JVM the SRS specifies
        (2.1 / 2.1.1). The contract inspected is our own reconstruction (A8.2, Unsupported).
        A self-authored contract cannot fail.
      </div>
      <p style={{ fontSize: 13 }}>
        The legacy path exposes only <code>sendMessage(toAgentId, body)</code> /
        <code>onMessage(handler)</code> — no encryption toggle, no TTL, no group controls.
      </p>
      <label>
        from{" "}
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {agents.map((a) => <option key={a.agentId}>{a.agentId}</option>)}
        </select>
      </label>{" "}
      <label>
        to{" "}
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {agents.map((a) => <option key={a.agentId}>{a.agentId}</option>)}
        </select>
      </label>
      <MessageComposer
        placeholder="legacy body (plaintext only)"
        onSend={(body) => run(() => api.sendUnicast({ senderId: from, recipientId: to, body: `[legacy] ${body}`, encrypted: false }))}
      />
      <StatusBadge state={status.state} event={status.event} detail={status.detail} />
      <MessageLog events={events} filter={(e) => e.type.includes("MESSAGE")} />
    </div>
  );
}
