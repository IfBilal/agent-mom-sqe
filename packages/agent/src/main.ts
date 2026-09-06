import { Agent } from "./agent.js";
import type { AgentToControl, ControlToAgent } from "./ipc.js";

// Thin forked-child bootstrap. All testable orchestration lives in `Agent`
// (agent.ts), which the component suite drives directly with a stub `send`
// so it is covered without fighting v8's forked-child instrumentation.

const send = (msg: AgentToControl): void => void process.send?.(msg);
let agent: Agent | null = null;

process.on("message", async (raw: ControlToAgent) => {
  if (raw.type === "init") {
    agent = new Agent(raw.config, send);
    try {
      await agent.start();
    } catch (err) {
      // e.g. a port is already bound — exit so the supervisor's spawn() rejects
      // cleanly instead of waiting on the ready watchdog.
      console.error(`agent ${raw.config.agentId} failed to start:`, (err as Error).message);
      process.exit(1);
    }
    return;
  }
  await agent?.onMessage(raw);
});

async function shutdown(): Promise<void> {
  await agent?.stop();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
// If the control plane (our IPC parent) goes away, do not linger as an orphan
// holding a unicast/multicast/broadcast port.
process.on("disconnect", shutdown);
