import { Router } from "express";
import { BROADCAST_PORT, DEMO_ALLOWLIST, DEMO_GROUPS } from "../agent-registry.js";
import { wrap, type RouteContext } from "./context.js";

// §10 Agents. POST forks a child process; DELETE kills it (SRS Fig. 1 narrative).
export function agentsRoutes(ctx: RouteContext): Router {
  const r = Router();

  r.get("/agents", (_req, res) => {
    res.json(ctx.registry.descriptors());
  });

  r.post(
    "/agents",
    wrap(async (req, res) => {
      const { agentId, role, unicastPort, ipcPort, architectureMode } = req.body;
      await ctx.supervisor.spawn({
        agentId,
        role: role ?? "standard",
        unicastPort,
        ipcPort,
        architectureMode: architectureMode ?? "agent-controlled",
        groupsAtStart: [],
        groups: DEMO_GROUPS,
        broadcastPort: BROADCAST_PORT,
        seed: process.env.AGENTMOM_DEMO_SEED ?? "se3002-agentmom-demo-seed",
        peers: {},
        allowList: role === "key-holder" ? DEMO_ALLOWLIST : undefined,
      });
      ctx.registry.seed({ agentId, role: role ?? "standard", unicastPort, ipcPort, groupsAtStart: [], architectureMode: architectureMode ?? "agent-controlled" });
      res.status(201).json(ctx.registry.descriptors().find((a) => a.agentId === agentId));
    }),
  );

  r.delete(
    "/agents/:agentId",
    wrap(async (req, res) => {
      await ctx.supervisor.kill(req.params.agentId);
      res.status(204).end();
    }),
  );

  r.patch(
    "/agents/:agentId/architecture",
    wrap(async (req, res) => {
      await ctx.supervisor.command(req.params.agentId, {
        kind: "set-architecture",
        architectureMode: req.body.architectureMode,
      });
      res.json(ctx.registry.descriptors().find((a) => a.agentId === req.params.agentId));
    }),
  );

  return r;
}
