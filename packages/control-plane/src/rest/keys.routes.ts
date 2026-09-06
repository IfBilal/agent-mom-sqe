import { Router } from "express";
import { wrap, type RouteContext } from "./context.js";

// §10 Keys — FR6 (BR-18).
export function keysRoutes(ctx: RouteContext): Router {
  const r = Router();

  r.post(
    "/keys/request",
    wrap(async (req, res) => {
      const { requestingAgentId, groupAddress } = req.body;
      await ctx.supervisor.command(requestingAgentId, { kind: "request-group-key", groupAddress });
      res.json({ requested: true });
    }),
  );

  r.get("/keys/:groupAddress/allowlist", (req, res) => {
    res.json({
      groupAddress: req.params.groupAddress,
      allowList: ctx.allowList[req.params.groupAddress] ?? [],
    });
  });

  return r;
}
