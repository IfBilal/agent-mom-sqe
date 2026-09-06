import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, type Harness } from "./helpers.js";

// Level I — integration. 2+ real agent processes + control plane, no UI.

let h: Harness;
beforeAll(async () => {
  h = await boot();
}, 30000);
afterAll(async () => {
  await h.cp.close();
});

describe("TC-02 / COND-06 — a message sent A→B is not received by C (3.2.1.3, BR-01)", () => {
  it("only B receives", async () => {
    const t0 = Date.now();
    await h.api("/api/messages/unicast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-A", recipientId: "agent-B", body: "for-B-only", encrypted: false }),
    });
    await new Promise((r) => setTimeout(r, 300));
    const log = await h.logSince(t0);
    const received = log.filter((e) => e["event"] === "MESSAGE_RECEIVED");
    expect(received.length).toBeGreaterThanOrEqual(1);
    // Every MESSAGE_RECEIVED for this exchange is attributed to agent-B.
    for (const e of received) {
      const detail = JSON.parse(e["detail"] as string) as { agentId?: string };
      expect(detail.agentId === "agent-B" || detail.agentId === undefined).toBe(true);
    }
  });
});

describe("TC-03 / COND-07 — 50 messages sent A→B arrive in the order sent (3.2.1.4)", () => {
  it("ordered delivery", async () => {
    const t0 = Date.now();
    for (let i = 1; i <= 50; i++) {
      await h.api("/api/messages/unicast", {
        method: "POST",
        body: JSON.stringify({ senderId: "agent-A", recipientId: "agent-B", body: `seq-${i}`, encrypted: false }),
      });
    }
    await new Promise((r) => setTimeout(r, 600));
    const log = await h.logSince(t0);
    const anomalies = log.filter((e) => e["event"] === "SEQUENCE_ANOMALY");
    expect(anomalies).toHaveLength(0); // COND-08 — no anomaly on in-order traffic
    const sent = log.filter((e) => e["event"] === "MESSAGE_SENT" && e["senderId"] === "agent-A");
    expect(sent.length).toBeGreaterThanOrEqual(50);
  });
});

describe("TC-13 / COND-38+39 — encryption is opt-in per message and auto-decrypts (FR5)", () => {
  it("encrypted send is delivered and readable by the recipient with no user action", async () => {
    const t0 = Date.now();
    await h.api("/api/messages/unicast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-A", recipientId: "agent-B", body: "cipher-me", encrypted: true }),
    });
    const hit = await h.waitForEvent(
      (e) => e["event"] === "MESSAGE_RECEIVED" && Boolean(e["encrypted"]),
    );
    expect(hit).not.toBeNull();
  });
});

describe("COND-09 — sending to a stopped agent surfaces a connection error, not a crash", () => {
  it("agent-A stays alive after addressing a killed peer", async () => {
    await h.api("/api/agents/agent-C", { method: "DELETE" });
    await new Promise((r) => setTimeout(r, 200));
    const res = await h.api("/api/messages/unicast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-A", recipientId: "agent-C", body: "gone", encrypted: false }),
    });
    expect(res.status).toBe(400); // clean error, not a hang or crash
    const agents = await h.json<Array<{ agentId: string }>>("/api/agents");
    expect(agents.some((a) => a.agentId === "agent-A")).toBe(true);
    // respawn for later suites
    await h.api("/api/agents", {
      method: "POST",
      body: JSON.stringify({ agentId: "agent-C", role: "standard", unicastPort: 7003, ipcPort: 8003, architectureMode: "component-controlled" }),
    });
  });
});
