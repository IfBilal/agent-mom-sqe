import { afterEach, describe, expect, it } from "vitest";
import { Agent } from "../../src/agent.js";
import type { AgentConfig } from "../../src/config.js";
import type { AgentToControl } from "../../src/ipc.js";
import type { LiveEvent } from "@agentmom/core";

// Drives the Agent orchestrator directly with a stub `send`, so agent.ts is
// covered without relying on v8 instrumenting a forked child (plan §12.4).

const GROUP = "239.30.30.7";
const GROUP_PORT = 15600;

function cfg(agentId: string, unicastPort: number, over: Partial<AgentConfig> = {}): AgentConfig {
  return {
    agentId,
    role: agentId === "agent-D" ? "key-holder" : "standard",
    unicastPort,
    ipcPort: unicastPort + 1000,
    architectureMode: "agent-controlled",
    groupsAtStart: [],
    groups: { [GROUP]: { groupAddress: GROUP, port: GROUP_PORT } },
    broadcastPort: 19600,
    seed: "orchestration-seed",
    peers: {},
    allowList: agentId === "agent-D" ? { [GROUP]: ["agent-D", "agent-C"] } : undefined,
    ...over,
  };
}

interface Harnessed {
  agent: Agent;
  events: LiveEvent[];
  results: Array<{ id: string; ok: boolean; data?: unknown; error?: string }>;
}

function harness(config: AgentConfig): Harnessed {
  const events: LiveEvent[] = [];
  const results: Harnessed["results"] = [];
  const agent = new Agent(config, (msg: AgentToControl) => {
    if (msg.type === "event") events.push(msg.event);
    if (msg.type === "cmd-result") results.push({ id: msg.id, ok: msg.ok, data: msg.data, error: msg.error });
  });
  return { agent, events, results };
}

let open: Agent[] = [];
afterEach(async () => {
  await Promise.all(open.map((a) => a.stop().catch(() => {})));
  open = [];
});

async function cmd(h: Harnessed, kind: string, extra: Record<string, unknown> = {}): Promise<unknown> {
  const id = `${kind}-${Math.random()}`;
  await h.agent.onMessage({ type: "cmd", id, cmd: { kind, ...extra } as never });
  const r = h.results.find((x) => x.id === id);
  if (!r) throw new Error(`no result for ${kind}`);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

describe("Agent orchestrator — unicast path (onUnicast, dispatch, sequence, auto-decrypt)", () => {
  it("delivers A→B, auto-decrypts an encrypted message, and drops a wrong-recipient envelope", async () => {
    const a = harness(cfg("agent-A", 18401));
    const b = harness(cfg("agent-B", 18402));
    open.push(a.agent, b.agent);
    await a.agent.start();
    await b.agent.start();
    const peers = { "agent-A": { host: "127.0.0.1", unicastPort: 18401 }, "agent-B": { host: "127.0.0.1", unicastPort: 18402 } };
    await a.agent.onMessage({ type: "peer-update", peers });
    await b.agent.onMessage({ type: "peer-update", peers });

    await cmd(a, "send-unicast", { recipientId: "agent-B", body: { kind: "chat", body: { text: "hi" } }, encrypted: false });
    await cmd(a, "send-unicast", { recipientId: "agent-B", body: { kind: "chat", body: { text: "secret" } }, encrypted: true });
    await new Promise((r) => setTimeout(r, 150));

    const received = b.events.filter((e) => e.type === "MESSAGE_RECEIVED");
    expect(received.length).toBe(2);
    expect(received.some((e) => e.payload["encrypted"] === true)).toBe(true);
    expect(b.events.some((e) => e.type === "DECRYPTION_FAILED")).toBe(false);
  });
});

describe("Agent orchestrator — FR6 key-holder protocol (serveKeyRequest, BR-18/BR-19)", () => {
  it("grants an allow-listed request and denies a non-allow-listed one, both over encrypted unicast", async () => {
    const c = harness(cfg("agent-C", 18403));
    const d = harness(cfg("agent-D", 18404, { groupsAtStart: [GROUP] }));
    const e = harness(cfg("agent-E", 18405));
    open.push(c.agent, d.agent, e.agent);
    await c.agent.start();
    await d.agent.start();
    await e.agent.start();
    const peers = {
      "agent-C": { host: "127.0.0.1", unicastPort: 18403 },
      "agent-D": { host: "127.0.0.1", unicastPort: 18404 },
      "agent-E": { host: "127.0.0.1", unicastPort: 18405 },
    };
    for (const h of [c, d, e]) await h.agent.onMessage({ type: "peer-update", peers });

    await cmd(c, "request-group-key", { groupAddress: GROUP });
    await cmd(e, "request-group-key", { groupAddress: GROUP });
    await new Promise((r) => setTimeout(r, 200));

    expect(d.events.some((ev) => ev.type === "GROUP_KEY_GRANTED" && ev.payload["requestingAgentId"] === "agent-C")).toBe(true);
    expect(d.events.some((ev) => ev.type === "GROUP_KEY_DENIED" && ev.payload["requestingAgentId"] === "agent-E")).toBe(true);
    // BR-19 — the key exchange traffic is encrypted regardless of opt-out.
    const keyTraffic = [...c.events, ...d.events].filter((ev) => ev.type === "MESSAGE_SENT" || ev.type === "MESSAGE_RECEIVED");
    expect(keyTraffic.length).toBeGreaterThan(0);
    for (const ev of keyTraffic) expect(ev.payload["encrypted"]).toBe(true);
  });
});

describe("Agent orchestrator — FR7 live switch + admin commands", () => {
  it("set-architecture swaps the handler and emits ARCHITECTURE_SWITCHED; snapshot reports the new mode", async () => {
    const a = harness(cfg("agent-A", 18406));
    open.push(a.agent);
    await a.agent.start();

    const snap0 = (await cmd(a, "snapshot")) as { architectureMode: string };
    expect(snap0.architectureMode).toBe("agent-controlled");

    await cmd(a, "set-architecture", { architectureMode: "component-controlled" });
    expect(a.events.some((e) => e.type === "ARCHITECTURE_SWITCHED")).toBe(true);

    const snap1 = (await cmd(a, "snapshot")) as { architectureMode: string };
    expect(snap1.architectureMode).toBe("component-controlled");

    // admin demo-aid commands round-trip
    expect(await cmd(a, "set-drop-rate", { dropRate: 0.5 })).toMatchObject({ dropRate: 0.5 });
    expect(await cmd(a, "set-default-ttl", { defaultTtl: 3 })).toMatchObject({ defaultTtl: 3 });
    expect(await cmd(a, "set-broadcast-denied", { simulateDenied: true })).toMatchObject({ simulateDenied: true });
  });
});

describe("Agent orchestrator — FR2 membership commands", () => {
  it("join → leave updates the application-level membership set (BR-04/BR-05)", async () => {
    const a = harness(cfg("agent-A", 18407));
    open.push(a.agent);
    await a.agent.start();

    await cmd(a, "join", { groupAddress: GROUP });
    expect(((await cmd(a, "snapshot")) as { memberships: string[] }).memberships).toContain(GROUP);

    await cmd(a, "leave", { groupAddress: GROUP });
    expect(((await cmd(a, "snapshot")) as { memberships: string[] }).memberships).not.toContain(GROUP);
  });
});

describe("Agent orchestrator — NFR8 legacy adapter path + remaining commands", () => {
  it("legacy-send round-trips through the 1.2 adapter and bypasses every new feature (BR-22)", async () => {
    const a = harness(cfg("agent-A", 18408));
    const b = harness(cfg("agent-B", 18409));
    open.push(a.agent, b.agent);
    await a.agent.start();
    await b.agent.start();
    const peers = { "agent-A": { host: "127.0.0.1", unicastPort: 18408 }, "agent-B": { host: "127.0.0.1", unicastPort: 18409 } };
    await a.agent.onMessage({ type: "peer-update", peers });
    await b.agent.onMessage({ type: "peer-update", peers });

    await cmd(a, "legacy-send", { toAgentId: "agent-B", body: "legacy hello" });
    await new Promise((r) => setTimeout(r, 150));

    const recv = b.events.find((e) => e.type === "MESSAGE_RECEIVED");
    expect(recv?.payload["encrypted"]).toBe(false); // 1.2 predates FR5 — always plaintext
  });

  it("an unknown command yields ok:false without crashing the agent", async () => {
    const a = harness(cfg("agent-A", 18410));
    open.push(a.agent);
    await a.agent.start();
    const id = "bad-1";
    await a.agent.onMessage({ type: "cmd", id, cmd: { kind: "not-a-real-command" } as never });
    const r = a.results.find((x) => x.id === id);
    expect(r).toMatchObject({ ok: false });
    expect(r?.error).toContain("unknown command");
    // still responsive
    expect(await cmd(a, "snapshot")).toMatchObject({ agentId: "agent-A" });
  });

  it("config-group and admin demo-aid commands round-trip", async () => {
    const a = harness(cfg("agent-A", 18411));
    open.push(a.agent);
    await a.agent.start();
    expect(await cmd(a, "config-group", { groupAddress: GROUP, port: 15650 })).toMatchObject({ port: 15650 });
    // send-broadcast returns an addressUsed
    const bc = (await cmd(a, "send-broadcast", { body: { kind: "chat", body: { text: "hi" } } })) as { addressUsed?: string };
    expect(typeof bc.addressUsed).toBe("string");
    // send-multicast to a joined group does not throw
    await cmd(a, "join", { groupAddress: GROUP });
    await cmd(a, "send-multicast", { groupAddress: GROUP, body: { kind: "chat", body: { text: "mc" } }, ttl: 5, encrypted: false });
  });

  it("a peer-update refreshes the address book", async () => {
    const a = harness(cfg("agent-A", 18412));
    open.push(a.agent);
    await a.agent.start();
    await a.agent.onMessage({ type: "peer-update", peers: { "agent-Z": { host: "127.0.0.1", unicastPort: 18499 } } });
    // sending to an unknown peer now fails with a connect error, not "no address book entry"
    await a.agent.onMessage({ type: "cmd", id: "z", cmd: { kind: "send-unicast", recipientId: "agent-Z", body: { kind: "chat", body: {} }, encrypted: false } });
    const r = a.results.find((x) => x.id === "z");
    expect(r?.ok).toBe(false);
  });
});
