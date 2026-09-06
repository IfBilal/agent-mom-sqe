import { useState } from "react";
import { api } from "../lib/api-client";
import { StatusBadge } from "../components/StatusBadge";
import { MessageComposer } from "../components/MessageComposer";
import { MessageLog } from "../components/MessageLog";
import { useAction } from "../lib/useAction";
import type { PageProps } from "./types";

// NFR8 — legacy-only send panel that BYPASSES every new-feature control.
export function Compatibility({ agents, events, eventsRef }: PageProps) {
  const [from, setFrom] = useState("agent-A");
  const [to, setTo] = useState("agent-B");
  const { status, run } = useAction(eventsRef, {
    success: ["MESSAGE_RECEIVED"],
    failure: ["PROTOCOL_VIOLATION", "AGENT_KILLED"],
  });

  return (
    <div>
      <h2>Compatibility <span className="req">NFR8 · agentMom 1.2</span></h2>
      <div className="card caution">
        This evaluation <strong>cannot validate real compatibility</strong>. No agentMom 1.2
        artifact was obtainable and this implementation is not on the JVM the SRS specifies
        (2.1 / 2.1.1). The contract inspected is our own reconstruction (A8.2, Unsupported).
        A self-authored contract cannot fail.
      </div>
      <div className="card">
        <p className="muted">
          The legacy path exposes only <code>sendMessage(toAgentId, body)</code> /
          <code>onMessage(handler)</code> — no encryption toggle, no TTL, no group controls.
        </p>
        <div className="row tight">
          <label>from
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              {agents.map((a) => <option key={a.agentId}>{a.agentId}</option>)}
            </select>
          </label>
          <label>to
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {agents.map((a) => <option key={a.agentId}>{a.agentId}</option>)}
            </select>
          </label>
        </div>
        <MessageComposer
          placeholder="legacy body (plaintext only)"
          onSend={(body) => run(() => api.sendUnicast({ senderId: from, recipientId: to, body: `[legacy] ${body}`, encrypted: false }))}
        />
        <StatusBadge state={status.state} event={status.event} detail={status.detail} />
      </div>
      <h3>Log</h3>
      <MessageLog events={events} filter={(e) => e.type.includes("MESSAGE")} />
    </div>
  );
}
