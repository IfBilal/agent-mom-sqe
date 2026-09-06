import type { LiveEvent } from "../lib/ws-client";

// §11 — the shared chronological log. Supplements, never replaces, per-page feedback.

function evtClass(type: string): string {
  if (type === "MESSAGE_SENT") return "evt sent";
  if (type === "MESSAGE_RECEIVED") return "evt recv";
  if (type.includes("DROPPED") || type.includes("FAILED") || type === "PROTOCOL_VIOLATION" || type.includes("DENIED") || type === "MESSAGE_MALFORMED") return "evt drop";
  if (type.includes("KEY")) return "evt key";
  if (type === "ARCHITECTURE_SWITCHED") return "evt arch";
  return "evt sys";
}

export function MessageLog({ events, filter }: { events: LiveEvent[]; filter?: (e: LiveEvent) => boolean }) {
  const rows = (filter ? events.filter(filter) : events).slice(-160).reverse();
  return (
    <div className="log-wrap">
      <table className="log">
        <thead>
          <tr><th>time</th><th>event</th><th>agent</th><th>detail</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={4} className="faint" style={{ padding: 14 }}>waiting for events…</td></tr>
          )}
          {rows.map((e, i) => (
            <tr key={`${e.ts}-${i}`}>
              <td className="faint">{new Date(e.ts).toLocaleTimeString()}</td>
              <td><span className={evtClass(e.type)}>{e.type}</span></td>
              <td>{String(e.payload["agentId"] ?? "—")}</td>
              <td className="detail">{JSON.stringify(e.payload).slice(0, 200)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
