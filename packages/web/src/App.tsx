// AI ASSUMPTION A11 — Design decision, not traceable to any SRS clause.
// This whole app is a TEST HARNESS OVER THE FRAMEWORK, added to satisfy the
// assignment's observability requirement. The SRS specifies a developer
// framework (§2.1, §2.3) with no interface requirements. No expected result in
// Part 3 is asserted about the harness itself — every expected result is
// asserted about framework behaviour observed *through* it.
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

const PAGES: Record<string, { label: string; Component: (p: PageProps) => JSX.Element }> = {
  dashboard: { label: "Dashboard", Component: Dashboard },
  unicast: { label: "Unicast", Component: Unicast },
  multicast: { label: "Multicast", Component: Multicast },
  broadcast: { label: "Broadcast", Component: Broadcast },
  security: { label: "Security", Component: Security },
  architecture: { label: "Architecture", Component: Architecture },
  compatibility: { label: "Compatibility", Component: Compatibility },
  admin: { label: "Admin", Component: Admin },
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
          <span className="tag">mission control · test harness for the agent framework</span>
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
          </button>
        ))}
      </nav>

      <main>
        <Component agents={agents} events={events} eventsRef={eventsRef} refresh={refresh} />
      </main>
    </div>
  );
}
