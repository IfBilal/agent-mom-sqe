import { useState } from "react";
import { api } from "../lib/api-client";
import { StatusBadge } from "../components/StatusBadge";
import { MessageComposer } from "../components/MessageComposer";
import { MessageLog } from "../components/MessageLog";
import { useAction } from "../lib/useAction";
import type { PageProps } from "./types";

export function Broadcast({ agents, events, eventsRef }: PageProps) {
  const [sender, setSender] = useState("agent-A");
  const [addressUsed, setAddressUsed] = useState<string | undefined>();
  const [denied, setDenied] = useState(false);
  const { status, run } = useAction(eventsRef, {
    success: ["MESSAGE_RECEIVED"],
    failure: ["BROADCAST_PERMISSION_DENIED"],
  });

  // Wording discipline (§1): a broadcast is SENT TO all possible hosts, never
  // "reaches" them. Per-agent indicators below evidence HOST-LOCAL reach only
  // (§9.4) — not 3.2.3.3's LAN-wide claim (TC-11 = BLOCKED).
  const recentReceivers = new Set(
    events
      .filter((e) => e.type === "MESSAGE_RECEIVED" && e.payload["mode"] === "broadcast")
      .slice(-8)
      .map((e) => String(e.payload["agentId"])),
  );

  return (
    <div>
      <h2>Broadcast <span className="req-chip">FR4</span></h2>
      <div className="panel">
        <div className="row">
          <label>from
            <select value={sender} onChange={(e) => setSender(e.target.value)}>
              {agents.map((a) => <option key={a.agentId}>{a.agentId}</option>)}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={denied}
              onChange={(e) => { setDenied(e.target.checked); api.setBroadcastPermission(e.target.checked); }}
            />
            simulate permission denied <span className="muted">(demo aid — a handled denial is a PASS, never a FAILED)</span>
          </label>
        </div>
        <MessageComposer
          onSend={(body) =>
            run(async () => {
              const out = await api.sendBroadcast({ senderId: sender, body });
              setAddressUsed(out.addressUsed);
            })
          }
        />
        <StatusBadge state={status.state} event={status.event} detail={status.detail} />
        <p className="muted">
          <strong>addressUsed:</strong> <code>{addressUsed ?? "—"}</code> — BR-12 may fall back from
          limited to subnet-directed
        </p>
      </div>

      <h3>Per-agent receipt <span className="muted">(host-local reach only)</span></h3>
      <div className="node-grid">
        {agents.map((a) => (
          <div key={a.agentId} className={`node${recentReceivers.has(a.agentId) ? " hot" : ""}`}>
            <div className="name">{a.agentId}</div>
            <div className="meta">{recentReceivers.has(a.agentId) ? "✓ received" : "—"}</div>
          </div>
        ))}
      </div>

      <h3>Broadcast log</h3>
      <MessageLog events={events} filter={(e) => e.type.includes("BROADCAST") || e.payload["mode"] === "broadcast"} />
    </div>
  );
}
