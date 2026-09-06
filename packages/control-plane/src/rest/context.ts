import type { AgentSupervisor } from "../agent-supervisor.js";
import type { AgentRegistry } from "../agent-registry.js";
import type { LogAggregator } from "../log-aggregator.js";

export interface RouteContext {
  supervisor: AgentSupervisor;
  registry: AgentRegistry;
  log: LogAggregator;
  groupPort: (groupAddress: string) => number;
  allowList: Record<string, string[]>;
}

export function wrap(
  handler: (req: import("express").Request, res: import("express").Response) => Promise<void>,
) {
  return (req: import("express").Request, res: import("express").Response): void => {
    handler(req, res).catch((err: Error) => {
      res.status(400).json({ error: { code: "COMMAND_FAILED", message: err.message } });
    });
  };
}
