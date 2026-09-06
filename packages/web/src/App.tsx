import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AgentDescriptor } from "./lib/api-client";
import { useLiveEvents } from "./lib/ws-client";
import { Dashboard } from "./pages/Dashboard";
import { Unicast } from "./pages/Unicast";
import { Multicast } from "./pages/Multicast";
import { Broadcast } from "./pages/Broadcast";
import { Security } from "./pages/Security";
import { Architecture } from "./pages/Architecture";
import { Compatibility } from "./pages/Compatibility";
import { Admin } from "./pages/Admin";
import type { PageProps } from "./pages/types";

const PAGES: Record<string, { label: string; reqs: string; Component: (p: PageProps) => JSX.Element }> = {
  dashboard: { label: "Dashboard", reqs: "all", Component: Dashboard },
  unicast: { label: "Unicast", reqs: "FR1, FR5", Component: Unicast },
  multicast: { label: "Multicast", reqs: "FR2, FR3", Component: Multicast },
  broadcast: { label: "Broadcast", reqs: "FR4", Component: Broadcast },
  security: { label: "Security", reqs: "FR5, FR6", Component: Security },
  architecture: { label: "Architecture", reqs: "FR7", Component: Architecture },
  compatibility: { label: "Compatibility", reqs: "NFR8", Component: Compatibility },
  admin: { label: "Admin", reqs: "NFR9, NFR10", Component: Admin },
};

export function App() {
  const [page, setPage] = useState("dashboard");
  const [agents, setAgents] = useState<AgentDescriptor[]>([]);
  const events = useLiveEvents();
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const refresh = useCallback(() => {
    api.agents().then(setAgents).catch(() => setAgents([]));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const { Component } = PAGES[page];

  return (
    <div className="app">
      <header className="app-header">
        <h1>agentMom</h1>
        <span className="sub">test harness over the framework · A11</span>
      </header>
      <nav className="nav">
        {Object.entries(PAGES).map(([key, p]) => (
          <button
            key={key}
            onClick={() => setPage(key)}
            aria-current={key === page}
            title={p.reqs}
          >
            {p.label}
          </button>
        ))}
      </nav>
      <main>
        <Component agents={agents} events={events} eventsRef={eventsRef} refresh={refresh} />
      </main>
    </div>
  );
}
