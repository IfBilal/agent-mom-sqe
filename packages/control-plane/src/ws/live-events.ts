import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { LiveEvent } from "@agentmom/core";

// WebSocket ws://localhost:4000/live — { type, payload, ts } (§10).
export class LiveEventHub {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<WebSocket>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/live" });
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
    });
  }

  publish(event: LiveEvent): void {
    const frame = JSON.stringify(event);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) ws.send(frame);
    }
  }

  close(): void {
    for (const ws of this.clients) ws.terminate();
    this.wss.close();
  }
}
