import { useEffect, useRef, useState } from "react";

export interface LiveEvent {
  type: string;
  payload: Record<string, unknown>;
  ts: number;
}

export interface LiveFeed {
  events: LiveEvent[];
  connected: boolean;
}

// Subscribes to ws://.../live (§10). Keeps a rolling buffer of the last N events
// and reports whether the socket is currently open.
export function useLiveEvents(limit = 500): LiveFeed {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const ref = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/live`);
      ref.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data as string) as LiveEvent;
          setEvents((prev) => [...prev.slice(-(limit - 1)), event]);
        } catch {
          /* ignore malformed frame */
        }
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ref.current?.close();
    };
  }, [limit]);

  return { events, connected };
}
