import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, type Harness } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await boot();
}, 30000);
afterAll(async () => {
  await h.cp.close();
});

async function unicastAndCountReceipts(sender: string, recipient: string, label: string): Promise<number> {
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) {
    await h.api("/api/messages/unicast", {
      method: "POST",
      body: JSON.stringify({ senderId: sender, recipientId: recipient, body: `${label}-${i}`, encrypted: false }),
    });
  }
  await new Promise((r) => setTimeout(r, 400));
  const log = await h.logSince(t0);
  return log.filter((e) => {
    if (e["event"] !== "MESSAGE_RECEIVED") return false;
    const d = JSON.parse((e["detail"] as string) ?? "{}") as { agentId?: string };
    return d.agentId === recipient;
  }).length;
}

describe("COND-47 — delivery behaviour is identical before and after a live architecture switch (3.2.5.1/.2)", () => {
  it("agent-B receives the same count of A→B messages either side of its own switch", async () => {
    const before = await unicastAndCountReceipts("agent-A", "agent-B", "pre");
    await h.api("/api/agents/agent-B/architecture", { method: "PATCH", body: JSON.stringify({ architectureMode: "component-controlled" }) });
    await new Promise((r) => setTimeout(r, 200));
    const after = await unicastAndCountReceipts("agent-A", "agent-B", "post");
    expect(before).toBe(5);
    expect(after).toBe(5);
  });
});

describe("COND-48 — a switch replaces only the handler; sockets and connections are not restarted (A7.2)", () => {
  it("no AGENT_KILLED / AGENT_SPAWNED around the switch, and the agent keeps its ports", async () => {
    const portsBefore = (await h.json<Array<{ agentId: string; unicastPort: number }>>("/api/agents")).find((a) => a.agentId === "agent-C")!;
    const t0 = Date.now();
    await h.api("/api/agents/agent-C/architecture", { method: "PATCH", body: JSON.stringify({ architectureMode: "agent-controlled" }) });
    await new Promise((r) => setTimeout(r, 300));
    const log = await h.logSince(t0);
    expect(log.some((e) => e["event"] === "AGENT_KILLED" || e["event"] === "AGENT_SPAWNED")).toBe(false);
    const portsAfter = (await h.json<Array<{ agentId: string; unicastPort: number }>>("/api/agents")).find((a) => a.agentId === "agent-C")!;
    expect(portsAfter.unicastPort).toBe(portsBefore.unicastPort);
    expect(log.some((e) => e["event"] === "ARCHITECTURE_SWITCHED")).toBe(true);
  });
});
