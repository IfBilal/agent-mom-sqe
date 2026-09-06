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
  const leaveInject = useAction(eventsRef, {
    success: ["MESSAGE_DROPPED_MEMBERSHIP"],
    failure: ["MESSAGE_RECEIVED"],
  });

  return (
    <div>
      <h2>Multicast — FR2 (membership), FR3 (messaging + TTL)</h2>
      <label>
        group{" "}
        <select value={group} onChange={(e) => { setGroup(e.target.value); setPort(e.target.value === GROUPS[0] ? 5007 : 5008); }}>
          {GROUPS.map((g) => <option key={g}>{g}</option>)}
        </select>
      </label>

      <h3>Membership (FR2) — live state</h3>
      <GroupMembershipPanel
        agents={agents}
        group={group}
        onJoin={(id) => api.join(group, id).then(refresh)}
        onLeave={(id) => api.leave(group, id).then(refresh)}
      />

      <h3>Group address / port config (3.2.2.8)</h3>
      <label>port <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} /></label>{" "}
      <button onClick={() => api.configGroup(group, sender, port).then(refresh)}>apply to {sender}</button>

      <h3>Send a multicast (FR3)</h3>
      <label>
        from{" "}
        <select value={sender} onChange={(e) => setSender(e.target.value)}>
          {agents.map((a) => <option key={a.agentId}>{a.agentId}</option>)}
        </select>
      </label>{" "}
      <label>TTL <input type="number" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} style={{ width: 60 }} /></label>
      <div><EncryptionToggle value={encrypted} onChange={setEncrypted} /></div>
      <MessageComposer onSend={(body) => send.run(() => api.sendMulticast({ senderId: sender, groupAddress: group, port, body, ttl, encrypted }))} />
      <StatusBadge state={send.status.state} event={send.status.event} detail={send.status.detail} />

      <h3>BR-06 — "send while leaving" (TC-05 entry point)</h3>
      <p style={{ fontSize: 12 }}>
        Fires a leave and an inbound multicast from another agent within the same event-loop tick.
        The datagram must be dropped, not delivered.
      </p>
      <button onClick={() => leaveInject.run(() => api.leaveThenInject(group, "agent-B", "agent-C"))}>
        agent-B: leave {group} while agent-C injects
      </button>
      <StatusBadge state={leaveInject.status.state} event={leaveInject.status.event} detail={leaveInject.status.detail} />

      <h3>Multicast log</h3>
      <MessageLog events={events} filter={(e) => e.type.includes("MESSAGE") || e.type === "PROTOCOL_VIOLATION"} />
    </div>
  );
}
