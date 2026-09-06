import { useState } from "react";
import { api } from "../lib/api-client";
import { StatusBadge } from "../components/StatusBadge";
import { GroupMembershipPanel } from "../components/GroupMembershipPanel";
import { MessageComposer } from "../components/MessageComposer";
import { MessageLog } from "../components/MessageLog";
import { EncryptionToggle } from "../components/EncryptionToggle";
import { useAction } from "../lib/useAction";
import { GROUPS, type PageProps } from "./types";

export function Multicast({ agents, events, eventsRef, refresh }: PageProps) {
  const [group, setGroup] = useState<string>(GROUPS[0]);
  const [sender, setSender] = useState("agent-C");
  const [ttl, setTtl] = useState(5);
  const [port, setPort] = useState(group === GROUPS[0] ? 5007 : 5008);
  const [encrypted, setEncrypted] = useState(false);

  const send = useAction(eventsRef, {
    success: ["MESSAGE_RECEIVED"],
    failure: ["MESSAGE_DROPPED_TTL_EXPIRED", "MESSAGE_DROPPED_MEMBERSHIP", "DECRYPTION_FAILED", "PROTOCOL_VIOLATION"],
  });
  // BR-06 holds iff agent-B receives nothing. Other α members (C, D) legitimately
  // still receive the injected datagram, so a generic MESSAGE_RECEIVED is NOT a
  // failure here.
  const leaveInject = useAction(eventsRef, {
    success: ["MESSAGE_DROPPED_MEMBERSHIP", "MESSAGE_SENT"],
    failure: [],
  });

  return (
    <div>
      <h2>Multicast</h2>
      <p className="muted">Group membership, group messaging, and time-to-live.</p>

      <div className="panel">
        <label>group
          <select value={group} onChange={(e) => { setGroup(e.target.value); setPort(e.target.value === GROUPS[0] ? 5007 : 5008); }}>
            {GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>

        <h3>Group membership — live state</h3>
        <GroupMembershipPanel
          agents={agents}
          group={group}
          onJoin={(id) => api.join(group, id).then(refresh)}
          onLeave={(id) => api.leave(group, id).then(refresh)}
        />

        <h3>Group address / port config</h3>
        <div className="row tight">
          <label>port <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} style={{ width: 90 }} /></label>
          <button className="btn secondary" onClick={() => api.configGroup(group, sender, port).then(refresh)}>apply to {sender}</button>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Send a multicast</h3>
        <div className="row">
          <label>from
            <select value={sender} onChange={(e) => setSender(e.target.value)}>
              {agents.map((a) => <option key={a.agentId}>{a.agentId}</option>)}
            </select>
          </label>
          <label>TTL <input type="number" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} style={{ width: 70 }} /></label>
          <EncryptionToggle value={encrypted} onChange={setEncrypted} />
        </div>
        <MessageComposer onSend={(body) => send.run(() => api.sendMulticast({ senderId: sender, groupAddress: group, port, body, ttl, encrypted }))} />
        <StatusBadge state={send.status.state} event={send.status.event} detail={send.status.detail} />
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Send while leaving</h3>
        <p className="muted">
          Fires a leave and an inbound multicast from another agent within the same event-loop tick.
          The datagram must be dropped for the leaving agent, not delivered.
        </p>
        <button className="btn" onClick={() => leaveInject.run(() => api.leaveThenInject(group, "agent-B", "agent-C"))}>
          agent-B: leave {group} while agent-C injects
        </button>
        <StatusBadge state={leaveInject.status.state} event={leaveInject.status.event} detail={leaveInject.status.detail} />
      </div>

      <h3>Multicast log</h3>
      <MessageLog events={events} filter={(e) => e.type.includes("MESSAGE") || e.type === "PROTOCOL_VIOLATION"} />
    </div>
  );
}
