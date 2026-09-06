import { useEffect, useRef, useState } from "react";

export interface LiveEvent {
  type: string;
  payload: Record<string, unknown>;
  ts: number;
}

// Subscribes to ws://.../live (§10). Keeps a rolling buffer of the last N events.
export function useLiveEvents(limit = 400): LiveEvent[] {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const ref = useRef<WebSocket | null>(null);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/live`);
    ref.current = ws;
    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data as string) as LiveEvent;
        setEvents((prev) => [...prev.slice(-(limit - 1)), event]);
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => ws.close();
  }, [limit]);

  return events;
}
