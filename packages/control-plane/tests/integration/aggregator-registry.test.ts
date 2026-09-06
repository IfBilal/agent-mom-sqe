import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@agentmom/core";
import { LogAggregator } from "../../src/log-aggregator.js";
import { AgentRegistry } from "../../src/agent-registry.js";
import type { AgentSupervisor } from "../../src/agent-supervisor.js";

const ev = (type: string, payload: Record<string, unknown> = {}): LiveEvent => ({ type: type as LiveEvent["type"], payload, ts: Date.now() });

describe("LogAggregator — pure filtering / fallbacks", () => {
  it("keeps only loggable event types", () => {
    const a = new LogAggregator();
    a.ingest(ev("AGENT_SPAWNED", { agentId: "agent-A" })); // not loggable
    a.ingest(ev("MESSAGE_SENT", { envelopeId: "e1", mode: "unicast", senderId: "agent-A" }));
    const rows = a.query({});
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event).toBe("MESSAGE_SENT");
  });

  it("applies '-' / defaults for missing fields and honours query filters", () => {
    const a = new LogAggregator();
    a.ingest(ev("PROTOCOL_VIOLATION", {})); // no envelopeId / sender / mode
    const [row] = a.query({});
    expect(row).toMatchObject({ envelopeId: "-", senderId: "-", mode: "unicast" });
    expect(a.query({ since: Date.now() + 10_000 })).toHaveLength(0);
    expect(a.query({ mode: "multicast" })).toHaveLength(0);
    expect(a.query({ agentId: "nobody" })).toHaveLength(0);
  });

  it("caps the ring buffer", () => {
    const a = new LogAggregator();
    for (let i = 0; i < 2100; i++) a.ingest(ev("MESSAGE_SENT", { envelopeId: `e${i}`, senderId: "x" }));
    expect(a.query({}).length).toBeLessThanOrEqual(2000);
  });
});

describe("AgentRegistry — applyEvent / seed / membership / descriptors", () => {
  const fakeSupervisor = { list: () => [] } as unknown as AgentSupervisor;

  it("applyEvent ignores events with no agentId and records ARCHITECTURE_SWITCHED", () => {
    const r = new AgentRegistry(fakeSupervisor);
    r.applyEvent(ev("MESSAGE_SENT", {})); // no agentId — ignored
    r.seed({ agentId: "agent-A", role: "standard", unicastPort: 7001, ipcPort: 8001, groupsAtStart: ["239.1.1.5"], architectureMode: "agent-controlled" });
    r.applyEvent(ev("ARCHITECTURE_SWITCHED", { agentId: "agent-A", architectureMode: "component-controlled" }));
    expect(r.membersOf("239.1.1.5")).toContain("agent-A");
    r.setMembership("agent-A", []);
    expect(r.membersOf("239.1.1.5")).not.toContain("agent-A");
  });
});
