import type { LiveEvent } from "../lib/ws-client";
import type { AgentDescriptor } from "../lib/api-client";

// Live MEMBER / JOINING / NOT_MEMBER badge per agent per group.
export function GroupMembershipPanel({
  agents,
  group,
  onJoin,
  onLeave,
}: {
  agents: AgentDescriptor[];
  group: string;
  onJoin: (agentId: string) => void;
  onLeave: (agentId: string) => void;
}) {
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <th style={c}>agent</th>
          <th style={c}>state for {group}</th>
          <th style={c}></th>
        </tr>
      </thead>
      <tbody>
        {agents.map((a) => {
          const isMember = a.memberships.includes(group);
          return (
            <tr key={a.agentId}>
              <td style={c}>{a.agentId}</td>
              <td style={c}>
                <code>{isMember ? "MEMBER" : "NOT_MEMBER"}</code>
              </td>
              <td style={c}>
                <button onClick={() => onJoin(a.agentId)} disabled={isMember}>join</button>
                <button onClick={() => onLeave(a.agentId)} disabled={!isMember}>leave</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const c: React.CSSProperties = { border: "1px solid #e0e0e0", padding: "3px 8px", textAlign: "left" };

export function lastMembershipEvent(events: LiveEvent[]): LiveEvent | undefined {
  return [...events].reverse().find((e) => e.type === "MESSAGE_DROPPED_MEMBERSHIP");
}
