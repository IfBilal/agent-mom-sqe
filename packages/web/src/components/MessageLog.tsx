import type { LiveEvent } from "../lib/ws-client";

// §11 — the shared chronological log. Supplements, never replaces, per-page feedback.
export function MessageLog({ events, filter }: { events: LiveEvent[]; filter?: (e: LiveEvent) => boolean }) {
  const rows = (filter ? events.filter(filter) : events).slice(-120).reverse();
  return (
    <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #ddd", fontSize: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f3f3f3" }}>
            <th style={cell}>time</th>
            <th style={cell}>event</th>
            <th style={cell}>agent</th>
            <th style={cell}>detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i}>
              <td style={cell}>{new Date(e.ts).toLocaleTimeString()}</td>
              <td style={cell}><code>{e.type}</code></td>
              <td style={cell}>{String(e.payload["agentId"] ?? "-")}</td>
              <td style={{ ...cell, whiteSpace: "nowrap" }}>{JSON.stringify(e.payload).slice(0, 160)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cell: React.CSSProperties = { border: "1px solid #e5e5e5", padding: "2px 6px", textAlign: "left" };
