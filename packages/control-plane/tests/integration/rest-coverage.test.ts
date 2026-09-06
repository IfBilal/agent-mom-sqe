import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { boot, type Harness } from "./helpers.js";

// Exercises every REST route + the WebSocket hub + registry/supervisor paths
// that the requirement-focused suites don't otherwise touch.

let h: Harness;
beforeAll(async () => {
  h = await boot();
}, 30000);
afterAll(async () => {
  await h.cp.close();
});

describe("agents.routes — REST lifecycle (POST / PATCH / DELETE)", () => {
  it("POST /agents forks a new agent, PATCH switches its architecture, DELETE kills it", async () => {
    const created = await h.json<{ agentId: string } | undefined>("/api/agents", {
      method: "POST",
      body: JSON.stringify({ agentId: "agent-X", role: "standard", unicastPort: 7051, ipcPort: 8051, architectureMode: "agent-controlled" }),
    });
    expect(created?.agentId).toBe("agent-X");

    const patched = await h.json<{ architectureMode: string } | undefined>("/api/agents/agent-X/architecture", {
      method: "PATCH",
      body: JSON.stringify({ architectureMode: "component-controlled" }),
    });
    expect(patched?.architectureMode).toBe("component-controlled");

    const del = await h.api("/api/agents/agent-X", { method: "DELETE" });
    expect(del.status).toBe(204);

    const gone = await h.json<Array<{ agentId: string }>>("/api/agents");
    expect(gone.some((a) => a.agentId === "agent-X")).toBe(false);
  });

  it("DELETE of an unknown agent → 400", async () => {
    expect((await h.api("/api/agents/no-such-agent", { method: "DELETE" })).status).toBe(400);
  });

  it("POST /agents with role/architecture omitted applies the defaults", async () => {
    const created = await h.json<{ agentId: string; role: string; architectureMode: string } | undefined>("/api/agents", {
      method: "POST",
      body: JSON.stringify({ agentId: "agent-def", unicastPort: 7052, ipcPort: 8052 }),
    });
    expect(created).toMatchObject({ role: "standard", architectureMode: "agent-controlled" });
    await h.api("/api/agents/agent-def", { method: "DELETE" });
  });

  it("POST a key-holder agent through REST", async () => {
    const created = await h.json<{ role: string } | undefined>("/api/agents", {
      method: "POST",
      body: JSON.stringify({ agentId: "agent-kh", role: "key-holder", unicastPort: 7053, ipcPort: 8053, architectureMode: "agent-controlled" }),
    });
    expect(created?.role).toBe("key-holder");
    await h.api("/api/agents/agent-kh", { method: "DELETE" });
  });

  it("POST /agents on an already-bound port → 400 (spawn rejects when the fork exits during startup)", async () => {
    const res = await h.api("/api/agents", {
      method: "POST",
      body: JSON.stringify({ agentId: "agent-clash", role: "standard", unicastPort: 7001, ipcPort: 8061, architectureMode: "agent-controlled" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("groups.routes — members + config", () => {
  it("GET /groups/:g/members reflects the demo topology", async () => {
    const r = await h.json<{ members: string[] }>("/api/groups/239.1.1.5/members");
    expect(r.members).toEqual(expect.arrayContaining(["agent-C", "agent-D"]));
  });
  it("PATCH /groups/:g/config accepts a new port", async () => {
    const r = await h.json<{ port: number }>("/api/groups/239.1.1.5/config", {
      method: "PATCH",
      body: JSON.stringify({ agentId: "agent-C", port: 5107 }),
    });
    expect(r.port).toBe(5107);
  });
});

describe("keys.routes — allowlist GET", () => {
  it("returns the key holder's allow-list for a group", async () => {
    const r = await h.json<{ allowList: string[] }>("/api/keys/239.1.1.5/allowlist");
    expect(r.allowList).toEqual(expect.arrayContaining(["agent-C", "agent-D"]));
  });
  it("returns [] for a group with no allow-list", async () => {
    const r = await h.json<{ allowList: string[] }>("/api/keys/239.9.9.9/allowlist");
    expect(r.allowList).toEqual([]);
  });
});

describe("admin.routes — every demo-aid endpoint", () => {
  it("PATCH /admin/reliability", async () => {
    expect(await h.json("/api/admin/reliability", { method: "PATCH", body: JSON.stringify({ dropRate: 0.3 }) })).toMatchObject({ dropRate: 0.3 });
    await h.json("/api/admin/reliability", { method: "PATCH", body: JSON.stringify({ dropRate: 0 }) });
  });
  it("PATCH /admin/broadcast-permission", async () => {
    expect(await h.json("/api/admin/broadcast-permission", { method: "PATCH", body: JSON.stringify({ simulateDenied: true }) })).toMatchObject({ simulateDenied: true });
    await h.json("/api/admin/broadcast-permission", { method: "PATCH", body: JSON.stringify({ simulateDenied: false }) });
  });
  it("PATCH /admin/default-ttl", async () => {
    expect(await h.json("/api/admin/default-ttl", { method: "PATCH", body: JSON.stringify({ defaultTtl: 4 }) })).toMatchObject({ defaultTtl: 4 });
  });
  it("GET /admin/preconditions + /admin/crypto", async () => {
    const pre = await h.json<{ multicast: unknown; broadcast: unknown }>("/api/admin/preconditions");
    expect(pre.multicast).toBeDefined();
    expect(pre.broadcast).toBeDefined();
    const c = await h.json<{ algorithm: string }>("/api/admin/crypto");
    expect(c.algorithm).toBe("AES-256-GCM");
  });
  it("POST /admin/spawn-demo is idempotent once the topology exists", async () => {
    const r = await h.json<{ agents: string[] }>("/api/admin/spawn-demo", { method: "POST" });
    expect(r.agents.length).toBeGreaterThanOrEqual(4);
  });
});

describe("messages.routes — log query filters", () => {
  it("GET /messages/log accepts agentId / mode / since", async () => {
    await h.api("/api/messages/unicast", { method: "POST", body: JSON.stringify({ senderId: "agent-A", recipientId: "agent-B", body: "log-me", encrypted: false }) });
    await new Promise((r) => setTimeout(r, 200));
    const filtered = await h.json<unknown[]>("/api/messages/log?agentId=agent-A&mode=unicast&since=1");
    expect(Array.isArray(filtered)).toBe(true);
  });
});

describe("ws/live-events — a subscriber receives events", () => {
  it("delivers a live event over the /live socket", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${h.cp.port}/live`);
    const got = new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 3000);
      ws.on("message", () => { clearTimeout(t); resolve(true); });
    });
    await new Promise((r) => ws.on("open", r));
    await h.api("/api/messages/unicast", { method: "POST", body: JSON.stringify({ senderId: "agent-A", recipientId: "agent-B", body: "ws", encrypted: false }) });
    expect(await got).toBe(true);
    ws.close();
  });
});
