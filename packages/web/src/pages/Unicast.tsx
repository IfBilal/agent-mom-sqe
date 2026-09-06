import { useState } from "react";
import { api } from "../lib/api-client";
import { StatusBadge } from "../components/StatusBadge";
import { EncryptionToggle } from "../components/EncryptionToggle";
import { MessageComposer } from "../components/MessageComposer";
import { MessageLog } from "../components/MessageLog";
import { useAction } from "../lib/useAction";
import type { PageProps } from "./types";

export function Unicast({ agents, events, eventsRef }: PageProps) {
  const [sender, setSender] = useState("agent-A");
  const [recipient, setRecipient] = useState("agent-B");
  const [encrypted, setEncrypted] = useState(false);
  const { status, run } = useAction(eventsRef, {
    success: ["MESSAGE_RECEIVED"],
    failure: ["PROTOCOL_VIOLATION", "DECRYPTION_FAILED", "SEQUENCE_ANOMALY", "MESSAGE_MALFORMED"],
  });

  const seqReadout = events
    .filter((e) => e.type === "SEQUENCE_ANOMALY")
    .slice(-3)
    .map((e) => `expected ${e.payload["expected"]}, got ${e.payload["received"]}`);

  return (
    <div>
      <h2>Unicast <span className="req">FR1 · FR5</span></h2>
      <div className="card">
        <div className="row">
          <label>from
            <select value={sender} onChange={(e) => setSender(e.target.value)}>
              {agents.map((a) => <option key={a.agentId}>{a.agentId}</option>)}
            </select>
          </label>
          <label>to
            <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
              {agents.map((a) => <option key={a.agentId}>{a.agentId}</option>)}
            </select>
          </label>
          <EncryptionToggle value={encrypted} onChange={setEncrypted} />
        </div>
        <MessageComposer
          onSend={(body) => run(() => api.sendUnicast({ senderId: sender, recipientId: recipient, body, encrypted }))}
        />
        <StatusBadge state={status.state} event={status.event} detail={status.detail} />
        <p className="muted">sequence anomalies (BR-03): {seqReadout.join(" · ") || "none"}</p>
      </div>
      <h3>Unicast log</h3>
      <MessageLog
        events={events}
        filter={(e) => ["MESSAGE_SENT", "MESSAGE_RECEIVED", "PROTOCOL_VIOLATION", "DECRYPTION_FAILED", "SEQUENCE_ANOMALY"].includes(e.type)}
      />
    </div>
  );
}
