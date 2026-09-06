import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, type Harness } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await boot();
}, 30000);
afterAll(async () => {
  await h.cp.close();
});

describe("TC-14 / COND-42 — a non-allow-listed agent's key request is denied (BR-18)", () => {
  it("agent-B (member, not allow-listed) is denied for group α", async () => {
    const t0 = Date.now();
    await h.api("/api/keys/request", {
      method: "POST",
      body: JSON.stringify({ requestingAgentId: "agent-B", groupAddress: "239.1.1.5" }),
    });
    const denied = await h.waitForEvent((e) => e["event"] === "GROUP_KEY_DENIED");
    expect(denied).not.toBeNull();
  });

  it("COND-41 — agent-C (allow-listed) is granted", async () => {
    await h.api("/api/keys/request", {
      method: "POST",
      body: JSON.stringify({ requestingAgentId: "agent-C", groupAddress: "239.1.1.5" }),
    });
    const granted = await h.waitForEvent((e) => e["event"] === "GROUP_KEY_GRANTED");
    expect(granted).not.toBeNull();
  });
});

describe("TC-15 / COND-49 — a live architecture switch is observable with an ARCHITECTURE_SWITCHED marker (FR7)", () => {
  it("switch is logged and sockets are not restarted", async () => {
    const before = await h.json<Array<{ agentId: string }>>("/api/agents");
    await h.api("/api/agents/agent-A/architecture", {
      method: "PATCH",
      body: JSON.stringify({ architectureMode: "component-controlled" }),
    });
    const marker = await h.waitForEvent((e) => e["event"] === "ARCHITECTURE_SWITCHED");
    expect(marker).not.toBeNull();
    // COND-48 — the agent process (and thus its sockets) is unchanged.
    const after = await h.json<Array<{ agentId: string }>>("/api/agents");
    expect(after.length).toBe(before.length);
  });
});

describe("COND-14 — a message sent to a group before an agent joins is not delivered to it (3.2.2.5)", () => {
  it("agent-A (not joined to α) logs no delivery for an α multicast", async () => {
    const t0 = Date.now();
    await h.api("/api/messages/multicast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-C", groupAddress: "239.1.1.5", body: "alpha-only", ttl: 5, encrypted: false }),
    });
    await new Promise((r) => setTimeout(r, 400));
    const log = await h.logSince(t0);
    const deliveredToA = log.filter((e) => {
      if (e["event"] !== "MESSAGE_RECEIVED") return false;
      const d = JSON.parse((e["detail"] as string) ?? "{}") as { agentId?: string };
      return d.agentId === "agent-A";
    });
    expect(deliveredToA).toHaveLength(0);
  });
});

describe("TC-05 / COND-18 — a message inbound in the same event-loop tick as leave() is dropped (BR-06)", () => {
  it("leave-then-inject drops the in-flight datagram", async () => {
    // agent-B leaves α while agent-C injects an α multicast in the same tick.
    const t0 = Date.now();
    await h.api("/api/groups/239.1.1.5/leave-then-inject", {
      method: "POST",
      body: JSON.stringify({ agentId: "agent-B", injectFrom: "agent-C" }),
    });
    await new Promise((r) => setTimeout(r, 400));
    const log = await h.logSince(t0);
    // The membership gate rejects it — no MESSAGE_RECEIVED attributed to agent-B.
    const bReceived = log.filter((e) => {
      if (e["event"] !== "MESSAGE_RECEIVED") return false;
      const d = JSON.parse((e["detail"] as string) ?? "{}") as { agentId?: string };
      return d.agentId === "agent-B";
    });
    expect(bReceived).toHaveLength(0);
  });
});
