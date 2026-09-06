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
  dashboard: { label: "Dashboard", reqs: "ALL", Component: Dashboard },
  unicast: { label: "Unicast", reqs: "FR1·5", Component: Unicast },
  multicast: { label: "Multicast", reqs: "FR2·3", Component: Multicast },
  broadcast: { label: "Broadcast", reqs: "FR4", Component: Broadcast },
  security: { label: "Security", reqs: "FR5·6", Component: Security },
  architecture: { label: "Architecture", reqs: "FR7", Component: Architecture },
  compatibility: { label: "Compatibility", reqs: "NFR8", Component: Compatibility },
  admin: { label: "Admin", reqs: "NFR9·10", Component: Admin },
};

function readTheme(): "dark" | "light" {
  try {
    return (localStorage.getItem("agentmom-theme") as "dark" | "light") ?? "dark";
  } catch {
    return "dark";
  }
}

export function App() {
  const [page, setPage] = useState("dashboard");
  const [agents, setAgents] = useState<AgentDescriptor[]>([]);
  const [theme, setTheme] = useState<"dark" | "light">(readTheme);
  const { events, connected } = useLiveEvents();
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("agentmom-theme", theme); } catch { /* private mode */ }
  }, [theme]);

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
      <header className="topbar">
        <div className="brand">
          <span className="logo">agentMom</span>
          <span className="tag">mission control · harness over the framework (A11)</span>
        </div>
        <span className="spacer" />
        <span className={`conn${connected ? " live" : ""}`}>
          <span className="led" /> {connected ? "live" : "offline"} · {events.length} events
        </span>
        <button
          className="theme-btn"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          title="toggle theme"
          aria-label="toggle theme"
        >
          {theme === "dark" ? "☾" : "☀"}
        </button>
      </header>

      <nav className="nav">
        {Object.entries(PAGES).map(([key, p]) => (
          <button key={key} onClick={() => setPage(key)} aria-current={key === page}>
            {p.label}
            <span className="req">{p.reqs}</span>
          </button>
        ))}
      </nav>

      <main>
        <Component agents={agents} events={events} eventsRef={eventsRef} refresh={refresh} />
      </main>
    </div>
  );
}
