import { Router } from "express";
import { wrap, type RouteContext } from "./context.js";

// §10 Groups — FR2 / FR3 (3.2.2.8).
export function groupsRoutes(ctx: RouteContext): Router {
  const r = Router();

  const refreshMembership = async (agentId: string): Promise<string[]> => {
    const snap = (await ctx.supervisor.command(agentId, { kind: "snapshot" })) as { memberships: string[] };
    ctx.registry.setMembership(agentId, snap.memberships);
    return snap.memberships;
  };

  r.post(
    "/groups/:groupAddress/join",
    wrap(async (req, res) => {
      const { agentId } = req.body;
      await ctx.supervisor.command(agentId, { kind: "join", groupAddress: req.params.groupAddress });
      res.json({ agentId, memberships: await refreshMembership(agentId) });
    }),
  );

  r.post(
    "/groups/:groupAddress/leave",
    wrap(async (req, res) => {
      const { agentId } = req.body;
      await ctx.supervisor.command(agentId, { kind: "leave", groupAddress: req.params.groupAddress });
      res.json({ agentId, memberships: await refreshMembership(agentId) });
    }),
  );

  r.post(
    "/groups/:groupAddress/leave-then-inject",
    wrap(async (req, res) => {
      // TC-05 / BR-06 entry point — "send while leaving".
      const { agentId, injectFrom } = req.body;
      await ctx.supervisor.command(agentId, {
        kind: "leave-then-inject",
        groupAddress: req.params.groupAddress,
        injectFrom: injectFrom ?? "agent-C",
      });
      res.json({ agentId, memberships: await refreshMembership(agentId) });
    }),
  );

  r.get("/groups/:groupAddress/members", (req, res) => {
    res.json({ groupAddress: req.params.groupAddress, members: ctx.registry.membersOf(req.params.groupAddress) });
  });

  r.patch(
    "/groups/:groupAddress/config",
    wrap(async (req, res) => {
      const { agentId, port } = req.body;
      await ctx.supervisor.command(agentId, { kind: "config-group", groupAddress: req.params.groupAddress, port });
      res.json({ groupAddress: req.params.groupAddress, port });
    }),
  );

  return r;
}
