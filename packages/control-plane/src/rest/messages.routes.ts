import { Router } from "express";
import { wrap, type RouteContext } from "./context.js";

// §10 Messaging.
export function messagesRoutes(ctx: RouteContext): Router {
  const r = Router();

  r.post(
    "/messages/unicast",
    wrap(async (req, res) => {
      const { senderId, recipientId, body, encrypted } = req.body;
      await ctx.supervisor.command(senderId, {
        kind: "send-unicast",
        recipientId,
        body: { kind: "chat", body: { text: body } },
        encrypted: Boolean(encrypted),
      });
      res.json({ envelopeId: "queued" });
    }),
  );

  r.post(
    "/messages/multicast",
    wrap(async (req, res) => {
      const { senderId, groupAddress, port, body, ttl, encrypted } = req.body;
      const out = await ctx.supervisor.command(senderId, {
        kind: "send-multicast",
        groupAddress,
        port,
        ttl,
        body: { kind: "chat", body: { text: body } },
        encrypted: Boolean(encrypted),
      });
      res.json({ envelopeId: "queued", ...(out as object) });
    }),
  );

  r.post(
    "/messages/broadcast",
    wrap(async (req, res) => {
      const { senderId, body } = req.body;
      // addressUsed is returned because BR-12 may fall back from limited to
      // subnet-directed broadcast, and the evidence needs to record which.
      const out = (await ctx.supervisor.command(senderId, {
        kind: "send-broadcast",
        body: { kind: "chat", body: { text: body } },
      })) as { addressUsed?: string };
      res.json({ envelopeId: "queued", addressUsed: out?.addressUsed });
    }),
  );

  r.get("/messages/log", (req, res) => {
    res.json(
      ctx.log.query({
        agentId: req.query.agentId as string | undefined,
        mode: req.query.mode as string | undefined,
        since: req.query.since ? Number(req.query.since) : undefined,
      }),
    );
  });

  return r;
}
