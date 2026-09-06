import { api } from "../lib/api-client";
import { ArchitectureSwitch } from "../components/ArchitectureSwitch";
import { MessageLog } from "../components/MessageLog";
import { StatusBadge } from "../components/StatusBadge";
import { useAction } from "../lib/useAction";
import type { PageProps } from "./types";

export function Architecture({ agents, events, eventsRef, refresh }: PageProps) {
  const { status, run } = useAction(eventsRef, {
    success: ["ARCHITECTURE_SWITCHED"],
    failure: ["AGENT_KILLED"],
  });

  return (
    <div>
      <h2>Architecture <span className="req-chip">FR7</span></h2>
      <div className="panel">
        <p className="muted">
          BR-21: both handlers implement one <code>ConversationHandler</code>. A7.2: switching
          replaces only the handler, never the sockets — delivery is identical either side.
        </p>
        {agents.map((a) => (
          <ArchitectureSwitch
            key={a.agentId}
            agentId={a.agentId}
            mode={a.architectureMode}
            onSwitch={(id, mode) => run(async () => { await api.setArchitecture(id, mode); refresh(); })}
          />
        ))}
        <StatusBadge state={status.state} event={status.event} detail={status.detail} />
      </div>
      <h3>Architecture log</h3>
      <MessageLog events={events} filter={(e) => e.type === "ARCHITECTURE_SWITCHED" || e.type.includes("MESSAGE")} />
    </div>
  );
}
