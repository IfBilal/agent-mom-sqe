import { useEffect, useState } from "react";
import { api } from "../lib/api-client";
import { StatusBadge } from "../components/StatusBadge";
import { MessageComposer } from "../components/MessageComposer";
import { MessageLog } from "../components/MessageLog";
import { useAction } from "../lib/useAction";
import { GROUPS, type PageProps } from "./types";

export function Security({ agents, events, eventsRef }: PageProps) {
  const [group, setGroup] = useState<string>(GROUPS[0]);
  const [allow, setAllow] = useState<string[]>([]);
  const [requester, setRequester] = useState("agent-C");
  const [sender, setSender] = useState("agent-C");
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    api.allowlist(group).then((r) => setAllow(r.allowList)).catch(() => setAllow([]));
  }, [group]);

  useEffect(() => {
    if (events.some((e) => e.type === "GROUP_KEY_GRANTED" && e.payload["agentId"] === sender && e.payload["groupAddress"] === group)) {
      setHasKey(true);
    }
  }, [events, sender, group]);

  const keyReq = useAction(eventsRef, { success: ["GROUP_KEY_GRANTED"], failure: ["GROUP_KEY_DENIED"] });
  const mcSend = useAction(eventsRef, { success: ["MESSAGE_RECEIVED"], failure: ["DECRYPTION_FAILED"] });

  return (
    <div>
      <h2>Security <span className="req-chip">FR5 unicast · FR6 group key</span></h2>

      <div className="panel">
        <label>group
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <h3>Key-holder allow-list (agent-D) — BR-18</h3>
        <p className="muted">
          Allow-list ≠ current membership (§9.6). Allowed: <code>{allow.join(", ") || "none"}</code>
        </p>

        <h3>Request group key</h3>
        <div className="row tight">
          <label>as
            <select value={requester} onChange={(e) => setRequester(e.target.value)}>
              {agents.map((a) => <option key={a.agentId}>{a.agentId}</option>)}
            </select>
          </label>
          <button className="btn" onClick={() => { setSender(requester); keyReq.run(() => api.requestKey(requester, group)); }}>
            Request Group Key
          </button>
        </div>
        <StatusBadge state={keyReq.status.state} event={keyReq.status.event} detail={keyReq.status.detail} />
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Encrypted multicast composer (FR6)</h3>
        {!hasKey && (
          <p className="disabled-hint" title="request and be granted a group key first">
            disabled — {sender} holds no group key for {group}
          </p>
        )}
        <MessageComposer
          disabled={!hasKey}
          onSend={(body) => mcSend.run(() => api.sendMulticast({ senderId: sender, groupAddress: group, body, ttl: 5, encrypted: true }))}
        />
        <StatusBadge state={mcSend.status.state} event={mcSend.status.event} detail={mcSend.status.detail} />
      </div>

      <h3>Security log</h3>
      <MessageLog events={events} filter={(e) => e.type.includes("KEY") || e.type === "DECRYPTION_FAILED" || e.type.includes("MESSAGE")} />
    </div>
  );
}
