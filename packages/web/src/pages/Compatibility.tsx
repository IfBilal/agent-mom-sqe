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
      <h2>Legacy compatibility</h2>
      <p className="muted">Sends through the agentMom 1.2 interface — plaintext only, no new-feature controls.</p>
      <div className="panel caution">
        This panel demonstrates the legacy call path — it does <strong>not</strong> prove true
        compatibility. It runs on Node, not the Java runtime the original spec assumes, and
        there is no reference 1.2 build to check against.
      </div>
      <div className="panel">
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
