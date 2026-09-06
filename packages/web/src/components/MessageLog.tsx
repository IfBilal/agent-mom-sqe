import type { LiveEvent } from "../lib/ws-client";

// §11 — the shared chronological log. Supplements, never replaces, per-page feedback.
export function MessageLog({ events, filter }: { events: LiveEvent[]; filter?: (e: LiveEvent) => boolean }) {
  const rows = (filter ? events.filter(filter) : events).slice(-140).reverse();
  return (
    <div className="log-wrap">
      <table className="log">
        <thead>
          <tr>
            <th>time</th>
            <th>event</th>
            <th>agent</th>
            <th>detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={4} className="muted" style={{ padding: 12 }}>no events yet</td></tr>
          )}
          {rows.map((e, i) => (
            <tr key={i}>
              <td>{new Date(e.ts).toLocaleTimeString()}</td>
              <td><code className="evt">{e.type}</code></td>
              <td>{String(e.payload["agentId"] ?? "—")}</td>
              <td className="detail">{JSON.stringify(e.payload).slice(0, 180)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
