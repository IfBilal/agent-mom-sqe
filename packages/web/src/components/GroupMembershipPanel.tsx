import type { LiveEvent } from "../lib/ws-client";
import type { AgentDescriptor } from "../lib/api-client";

// Live MEMBER / NOT_MEMBER badge per agent per group.
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
    <table className="grid">
      <thead>
        <tr>
          <th>agent</th>
          <th>state · {group}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {agents.map((a) => {
          const isMember = a.memberships.includes(group);
          return (
            <tr key={a.agentId}>
              <td>{a.agentId}</td>
              <td>
                <span className={`pill ${isMember ? "member" : "not"}`}>
                  {isMember ? "MEMBER" : "NOT_MEMBER"}
                </span>
              </td>
              <td className="row tight">
                <button className="btn secondary" onClick={() => onJoin(a.agentId)} disabled={isMember}>join</button>
                <button className="btn secondary" onClick={() => onLeave(a.agentId)} disabled={!isMember}>leave</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function lastMembershipEvent(events: LiveEvent[]): LiveEvent | undefined {
  return [...events].reverse().find((e) => e.type === "MESSAGE_DROPPED_MEMBERSHIP");
}
