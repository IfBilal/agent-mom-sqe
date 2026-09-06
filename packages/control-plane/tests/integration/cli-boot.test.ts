import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/main.js";
import type { RunningControlPlane } from "../../src/main.js";

// Covers the CLI boot path (runCli) — resolved port, optional demo topology,
// health endpoint — without registering signal handlers on the test process.

let cp: RunningControlPlane | null = null;
afterEach(async () => {
  await cp?.close();
  cp = null;
});

describe("runCli — control-plane boot", () => {
  it("starts on an ephemeral port and serves /api/health", async () => {
    const lines: string[] = [];
    cp = await runCli({ port: 0, spawnDemo: false, registerSignals: false, log: (m) => lines.push(m) });
    expect(cp.port).toBeGreaterThan(0);
    expect(lines[0]).toContain(`http://localhost:${cp.port}/api`);

    const res = await fetch(`http://127.0.0.1:${cp.port}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("spawnDemo=true forks the four-agent topology", async () => {
    const lines: string[] = [];
    cp = await runCli({ port: 0, spawnDemo: true, registerSignals: false, log: (m) => lines.push(m) });
    expect(lines.some((l) => l.includes("demo topology spawned"))).toBe(true);

    const agents = (await (await fetch(`http://127.0.0.1:${cp.port}/api/agents`)).json()) as Array<{ agentId: string }>;
    expect(agents.map((a) => a.agentId).sort()).toEqual(["agent-A", "agent-B", "agent-C", "agent-D"]);
  });

  it("registerSignals wires SIGINT/SIGTERM/SIGHUP shutdown handlers", async () => {
    const before = ["SIGINT", "SIGTERM", "SIGHUP"].map((s) => process.listenerCount(s));
    cp = await runCli({ port: 0, spawnDemo: false, registerSignals: true, log: () => {} });
    const after = ["SIGINT", "SIGTERM", "SIGHUP"].map((s) => process.listenerCount(s));
    after.forEach((n, i) => expect(n).toBe(before[i] + 1));
    // remove our once-handlers so they never fire against the test runner
    for (const s of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
      const ls = process.listeners(s);
      process.removeListener(s, ls[ls.length - 1]!);
    }
  });

  it("rejects (does not hang) when the listen fails", async () => {
    // Port 1 is privileged; a non-root test runner gets EACCES. Either way the
    // promise must reject, never hang — the CLI's .catch then exits non-zero.
    await expect(
      runCli({ port: 1, spawnDemo: false, registerSignals: false, log: () => {} }),
    ).rejects.toBeInstanceOf(Error);
  }, 8000);
});
