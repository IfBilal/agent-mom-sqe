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
      "CON-04_multicast": {
        supported: true,
        scope: "single-host loopback",
        note: "Router/NIC/OS multicast scope is NOT verifiable on this test bed — this is TC-08 territory.",
      },
      "CON-05_broadcast": {
        supported: hasNonInternalV4,
        note: "Limited broadcast may require admin on some networks (2.4.4); BR-12 falls back to subnet-directed.",
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
      note: "Basic encryption only (NFR10 / 2.4.2). No strength, key-length or resistance claim is made (BR-24, A10.2).",
      unicastKeyModel: "deterministic pairwise sha256(sorted(pair)+SEED) — A5.2 UNSUPPORTED",
      multicastKeyModel: "random 32-byte per-group key from key holder, never rotated — A6.2 UNSUPPORTED",
    });
  });

  return r;
}
