import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, type Harness } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await boot();
}, 30000);
afterAll(async () => {
  await h.cp.close();
});

describe("COND-29 / TC-10 area — a broadcast send is received by every agent on the same host (3.2.3.1/.2)", () => {
  it("all four demo agents receive one broadcast; addressUsed is reported", async () => {
    const t0 = Date.now();
    const res = await h.json<{ addressUsed?: string }>("/api/messages/broadcast", {
      method: "POST",
      body: JSON.stringify({ senderId: "agent-A", body: "host-wide" }),
    });
    expect(typeof res.addressUsed).toBe("string"); // BR-12 — recorded for evidence
    await new Promise((r) => setTimeout(r, 400));
    const log = await h.logSince(t0);
    const receivers = new Set(
      log
        .filter((e) => e["event"] === "MESSAGE_RECEIVED")
        .map((e) => (JSON.parse((e["detail"] as string) ?? "{}") as { agentId?: string; mode?: string }))
        .filter((d) => d.mode === "broadcast")
        .map((d) => d.agentId),
    );
    for (const a of ["agent-A", "agent-B", "agent-C", "agent-D"]) {
      expect(receivers.has(a), `${a} did not receive the broadcast`).toBe(true);
    }
    // Scope honesty (§9.4): this evidences HOST-LOCAL reach only, not 3.2.3.3's
    // "all possible hosts under the same local network" (that is TC-11, BLOCKED).
  });
});
