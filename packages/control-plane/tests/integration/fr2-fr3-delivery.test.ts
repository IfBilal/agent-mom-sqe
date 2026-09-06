import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, type Harness } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await boot();
}, 30000);
afterAll(async () => {
  await h.cp.close();
});

function receiversFor(log: Array<Record<string, unknown>>, envelopeId?: string): Set<string> {
  return new Set(
    log
      .filter((e) => e["event"] === "MESSAGE_RECEIVED")
      .filter((e) => {
        const d = JSON.parse((e["detail"] as string) ?? "{}") as { agentId?: string; envelopeId?: string };
        return !envelopeId || d.envelopeId === envelopeId;
      })
      .map((e) => (JSON.parse((e["detail"] as string) ?? "{}") as { agentId?: string }).agentId)
      .filter(Boolean) as string[],
  );
}

describe("COND-26 / TC-06 area — a multicast send reaches every current member of the group (3.2.2.1/.2)", () => {
  it("group α members agent-B, agent-C, agent-D all receive", async () => {
    const t0 = Date.now();
    await h.api("/api/messages/multicast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-D", groupAddress: "239.1.1.5", body: "to-all-alpha", ttl: 5, encrypted: false }),
    });
    await new Promise((r) => setTimeout(r, 400));
    const recv = receiversFor(await h.logSince(t0));
    for (const m of ["agent-B", "agent-C", "agent-D"]) expect(recv.has(m)).toBe(true);
    expect(recv.has("agent-A")).toBe(false); // agent-A never joined α
  });
});

describe("COND-16 — an agent joined to α and β receives from both, each attributed to the correct group (3.2.2.9 / BR-07)", () => {
  it("agent-C attributes α and β traffic to the right group", async () => {
    const t0 = Date.now();
    await h.api("/api/messages/multicast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-D", groupAddress: "239.1.1.5", body: "alpha", ttl: 5, encrypted: false }),
    });
    await h.api("/api/messages/multicast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-C", groupAddress: "239.1.1.6", body: "beta", ttl: 5, encrypted: false }),
    });
    await new Promise((r) => setTimeout(r, 400));
    const log = await h.logSince(t0);
    const cReceipts = log
      .filter((e) => e["event"] === "MESSAGE_RECEIVED")
      .map((e) => JSON.parse((e["detail"] as string) ?? "{}") as { agentId?: string; groupAddress?: string })
      .filter((d) => d.agentId === "agent-C");
    const groups = new Set(cReceipts.map((d) => d.groupAddress));
    expect(groups.has("239.1.1.5")).toBe(true);
    expect(groups.has("239.1.1.6")).toBe(true);
    // no receipt is mis-attributed
    for (const d of cReceipts) expect(["239.1.1.5", "239.1.1.6"]).toContain(d.groupAddress);
  });
});

describe("COND-15 — a message sent to a group after an agent leaves is not delivered to it (3.2.2.6)", () => {
  it("agent-B, after leaving α, receives no further α multicast", async () => {
    await h.api("/api/groups/239.1.1.5/leave", { method: "POST", body: JSON.stringify({ agentId: "agent-B" }) });
    await new Promise((r) => setTimeout(r, 200));
    const t0 = Date.now();
    await h.api("/api/messages/multicast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-D", groupAddress: "239.1.1.5", body: "after-B-left", ttl: 5, encrypted: false }),
    });
    await new Promise((r) => setTimeout(r, 400));
    const recv = receiversFor(await h.logSince(t0));
    expect(recv.has("agent-B")).toBe(false);
    expect(recv.has("agent-C")).toBe(true); // C still a member
    // rejoin for later suites
    await h.api("/api/groups/239.1.1.5/join", { method: "POST", body: JSON.stringify({ agentId: "agent-B" }) });
  });
});

describe("COND-53 — a dropped datagram is never retransmitted (BR-23 / 2.4.1)", () => {
  it("dropRate = 1.0 yields MESSAGE_DROPPED_SIMULATED and no send/receive for that message", async () => {
    await h.api("/api/admin/reliability", { method: "PATCH", body: JSON.stringify({ dropRate: 1 }) });
    const t0 = Date.now();
    await h.api("/api/messages/multicast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-C", groupAddress: "239.1.1.5", body: "will-drop", ttl: 5, encrypted: false }),
    });
    await new Promise((r) => setTimeout(r, 400));
    const log = await h.logSince(t0);
    expect(log.some((e) => e["event"] === "MESSAGE_DROPPED_SIMULATED")).toBe(true);
    // No retry path: nothing SENT or RECEIVED after the drop.
    expect(log.some((e) => e["event"] === "MESSAGE_SENT" && e["mode"] === "multicast")).toBe(false);
    await h.api("/api/admin/reliability", { method: "PATCH", body: JSON.stringify({ dropRate: 0 }) });
  });
});
