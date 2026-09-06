import { Router } from "express";
import os from "node:os";
import { wrap, type RouteContext } from "./context.js";

// §10 Admin — NFR9 / NFR10 demo aids. None of these are SRS behaviour.
export function adminRoutes(ctx: RouteContext): Router {
  const r = Router();

  const broadcastToAll = async (cmd: Parameters<RouteContext["supervisor"]["command"]>[1]) => {
    for (const a of ctx.registry.descriptors()) {
      await ctx.supervisor.command(a.agentId, cmd).catch(() => void 0);
    }
  };

  r.patch(
    "/admin/reliability",
    wrap(async (req, res) => {
      await broadcastToAll({ kind: "set-drop-rate", dropRate: Number(req.body.dropRate) });
      res.json({ dropRate: Number(req.body.dropRate) });
    }),
  );

  r.patch(
    "/admin/broadcast-permission",
    wrap(async (req, res) => {
      await broadcastToAll({ kind: "set-broadcast-denied", simulateDenied: Boolean(req.body.simulateDenied) });
      res.json({ simulateDenied: Boolean(req.body.simulateDenied) });
    }),
  );

  r.patch(
    "/admin/default-ttl",
    wrap(async (req, res) => {
      await broadcastToAll({ kind: "set-default-ttl", defaultTtl: Number(req.body.defaultTtl) });
      res.json({ defaultTtl: Number(req.body.defaultTtl) });
    }),
  );

  // Dashboard precondition banner — CON-04 (multicast support) / CON-05 (broadcast).
  // Authoritative verification is scripts/verify-preconditions.sh (Phase 13);
  // this endpoint gives the harness a live indicator only.
  r.get("/admin/preconditions", (_req, res) => {
    const ifaces = os.networkInterfaces();
    const hasNonInternalV4 = Object.values(ifaces)
      .flat()
      .some((i) => i && i.family === "IPv4" && !i.internal);
    res.json({
      multicast: {
        available: true,
        scope: "single-host loopback",
        note: "Router / NIC / OS multicast scope cannot be verified on a single machine.",
      },
      broadcast: {
        available: hasNonInternalV4,
        note: "Limited broadcast may need admin rights on some networks; the sender falls back to the subnet-directed address.",
      },
      host: os.hostname(),
      interfaces: Object.keys(ifaces),
    });
  });

  r.post(
    "/admin/spawn-demo",
    wrap(async (_req, res) => {
      if (ctx.registry.descriptors().length === 0) await ctx.spawnDemoTopology();
      res.json({ agents: ctx.registry.descriptors().map((a) => a.agentId) });
    }),
  );

  r.get("/admin/crypto", (_req, res) => {
    res.json({
      algorithm: "AES-256-GCM",
      note: "Basic encryption only. No claim is made about encryption strength, key length, or resistance to attack.",
      unicastKeyModel: "one shared key per agent pair, derived deterministically — no key exchange",
      multicastKeyModel: "one random per-group key issued by the key holder, never rotated",
    });
  });

  return r;
}
