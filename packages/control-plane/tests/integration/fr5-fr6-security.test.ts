import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, MULTICAST_OK, type Harness } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await boot();
}, 30000);
afterAll(async () => {
  await h.cp.close();
});

const details = (log: Array<Record<string, unknown>>) =>
  log.map((e) => ({ event: e["event"] as string, ...(JSON.parse((e["detail"] as string) ?? "{}") as Record<string, unknown>) }));

describe("COND-38 — encrypted=false travels as plaintext; the same body with encrypted=true differs on the wire (BR-14)", () => {
  it("the wire-level encrypted flag tracks the per-message choice", async () => {
    const t0 = Date.now();
    await h.api("/api/messages/unicast", { method: "POST", body: JSON.stringify({ senderId: "agent-A", recipientId: "agent-B", body: "same-body", encrypted: false }) });
    await h.api("/api/messages/unicast", { method: "POST", body: JSON.stringify({ senderId: "agent-A", recipientId: "agent-B", body: "same-body", encrypted: true }) });
    await new Promise((r) => setTimeout(r, 400));
    const rx = details(await h.logSince(t0)).filter((d) => d.event === "MESSAGE_RECEIVED" && d.agentId === "agent-B");
    expect(rx.some((d) => d.encrypted === false)).toBe(true);
    expect(rx.some((d) => d.encrypted === true)).toBe(true);
  });
});

describe("COND-39 — the receiver decrypts automatically with no user action (3.2.4.4)", () => {
  it("an encrypted A→B message is received (auto-decrypted) with no DECRYPTION_FAILED", async () => {
    const t0 = Date.now();
    await h.api("/api/messages/unicast", { method: "POST", body: JSON.stringify({ senderId: "agent-A", recipientId: "agent-B", body: "auto", encrypted: true }) });
    await new Promise((r) => setTimeout(r, 300));
    const d = details(await h.logSince(t0));
    expect(d.some((e) => e.event === "MESSAGE_RECEIVED" && e.agentId === "agent-B" && e.encrypted === true)).toBe(true);
    expect(d.some((e) => e.event === "DECRYPTION_FAILED")).toBe(false);
  });
});

describe("COND-43 — key request and response are encrypted regardless of the sender's opt-out (BR-19)", () => {
  it("the key-exchange unicast traffic is encrypted:true", async () => {
    const t0 = Date.now();
    await h.api("/api/keys/request", { method: "POST", body: JSON.stringify({ requestingAgentId: "agent-C", groupAddress: "239.1.1.5" }) });
    await new Promise((r) => setTimeout(r, 400));
    const d = details(await h.logSince(t0));
    const keyTraffic = d.filter(
      (e) => (e.event === "MESSAGE_SENT" || e.event === "MESSAGE_RECEIVED") && (e.agentId === "agent-C" || e.agentId === "agent-D") && e.mode === "unicast",
    );
    expect(keyTraffic.length).toBeGreaterThan(0);
    for (const e of keyTraffic) expect(e.encrypted).toBe(true); // BR-19 overrides the BR-14 opt-out
  });
});

describe.skipIf(!MULTICAST_OK)("COND-44 — an encrypted multicast is readable by key-holding members and raises DECRYPTION_FAILED for others (3.2.4.5/.6) [needs CON-04]", () => {
  it("agent-D (key holder) reads it; agent-B (no key) fails closed", async () => {
    // agent-C obtains the group key; agent-B deliberately does not (not allow-listed).
    await h.api("/api/keys/request", { method: "POST", body: JSON.stringify({ requestingAgentId: "agent-C", groupAddress: "239.1.1.5" }) });
    await new Promise((r) => setTimeout(r, 400));

    const t0 = Date.now();
    await h.api("/api/messages/multicast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-C", groupAddress: "239.1.1.5", body: "secret-alpha", ttl: 5, encrypted: true }),
    });
    await new Promise((r) => setTimeout(r, 500));
    const d = details(await h.logSince(t0));
    expect(d.some((e) => e.event === "MESSAGE_RECEIVED" && e.agentId === "agent-D")).toBe(true); // holder reads it
    expect(d.some((e) => e.event === "DECRYPTION_FAILED" && e.agentId === "agent-B")).toBe(true); // non-holder fails closed
  });
});

describe("COND-54 — ciphertext observed on the wire differs from the plaintext body (2.4.2)", () => {
  it("a unique plaintext marker never appears in the observable event stream for an encrypted send", async () => {
    const marker = "PLAINTEXT-MARKER-a71f3";
    const t0 = Date.now();
    await h.api("/api/messages/unicast", { method: "POST", body: JSON.stringify({ senderId: "agent-A", recipientId: "agent-B", body: marker, encrypted: true }) });
    await new Promise((r) => setTimeout(r, 300));
    const raw = JSON.stringify(await h.logSince(t0));
    expect(raw.includes("MESSAGE_RECEIVED")).toBe(true); // it WAS delivered
    expect(raw.includes(marker)).toBe(false); // but the plaintext body is not on the wire
  });
});

describe.skipIf(!MULTICAST_OK)("COND-45 / BR-20 / A6.2 — after leaving, an agent that already holds the group key can still decrypt (deliberate, flagged) [needs CON-04]", () => {
  it("agent-C keeps a working key across a leave and still sends readable encrypted multicast", async () => {
    await h.api("/api/keys/request", { method: "POST", body: JSON.stringify({ requestingAgentId: "agent-C", groupAddress: "239.1.1.5" }) });
    await new Promise((r) => setTimeout(r, 400));
    await h.api("/api/groups/239.1.1.5/leave", { method: "POST", body: JSON.stringify({ agentId: "agent-C" }) });
    await h.api("/api/groups/239.1.1.5/join", { method: "POST", body: JSON.stringify({ agentId: "agent-C" }) });

    const t0 = Date.now();
    await h.api("/api/messages/multicast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-C", groupAddress: "239.1.1.5", body: "post-leave-secret", ttl: 5, encrypted: true }),
    });
    await new Promise((r) => setTimeout(r, 500));
    const d = details(await h.logSince(t0));
    // No key rotation on leave: agent-C could still encrypt, and agent-D still reads it.
    expect(d.some((e) => e.event === "MESSAGE_SENT" && e.agentId === "agent-C" && e.encrypted === true)).toBe(true);
    expect(d.some((e) => e.event === "MESSAGE_RECEIVED" && e.agentId === "agent-D")).toBe(true);
  });
});
