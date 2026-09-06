import http from "node:http";
import express from "express";
import type { LiveEvent } from "@agentmom/core";
import { AgentSupervisor } from "./agent-supervisor.js";
import {
  AgentRegistry,
  BROADCAST_PORT,
  DEMO_ALLOWLIST,
  DEMO_GROUPS,
  DEMO_TOPOLOGY,
} from "./agent-registry.js";
import { LogAggregator } from "./log-aggregator.js";
import { LiveEventHub } from "./ws/live-events.js";
import { agentsRoutes } from "./rest/agents.routes.js";
import { messagesRoutes } from "./rest/messages.routes.js";
import { groupsRoutes } from "./rest/groups.routes.js";
import { keysRoutes } from "./rest/keys.routes.js";
import { adminRoutes } from "./rest/admin.routes.js";
import type { RouteContext } from "./rest/context.js";

export interface RunningControlPlane {
  port: number;
  supervisor: AgentSupervisor;
  registry: AgentRegistry;
  close: () => Promise<void>;
  spawnDemoTopology: () => Promise<void>;
}

export async function startControlPlane(port = 0): Promise<RunningControlPlane> {
  const app = express();
  app.use(express.json());

  const hub: { publish: (e: LiveEvent) => void } = { publish: () => void 0 };
  const log = new LogAggregator();
  let registry: AgentRegistry;
  const supervisor = new AgentSupervisor((event) => {
    log.ingest(event);
    registry.applyEvent(event);
    hub.publish(event);
  });
  registry = new AgentRegistry(supervisor);

  const groupPort = (g: string): number => DEMO_GROUPS[g]?.port ?? BROADCAST_PORT;

  const spawnDemoTopology = async (): Promise<void> => {
    for (const spec of DEMO_TOPOLOGY) {
      await supervisor.spawn({
        ...spec,
        groups: DEMO_GROUPS,
        broadcastPort: BROADCAST_PORT,
        seed: process.env.AGENTMOM_DEMO_SEED ?? "se3002-agentmom-demo-seed",
        peers: {},
        allowList: spec.role === "key-holder" ? DEMO_ALLOWLIST : undefined,
      });
      registry.seed(spec);
    }
  };

  const ctx: RouteContext = { supervisor, registry, log, groupPort, allowList: DEMO_ALLOWLIST, spawnDemoTopology };

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", agentsRoutes(ctx));
  app.use("/api", messagesRoutes(ctx));
  app.use("/api", groupsRoutes(ctx));
  app.use("/api", keysRoutes(ctx));
  app.use("/api", adminRoutes(ctx));

  const server = http.createServer(app);
  const liveHub = new LiveEventHub(server);
  hub.publish = (e) => liveHub.publish(e);

  await new Promise<void>((resolve) => server.listen(port, resolve));
  const actualPort = (server.address() as { port: number }).port;

  return {
    port: actualPort,
    supervisor,
    registry,
    spawnDemoTopology,
    close: async () => {
      await supervisor.shutdown();
      liveHub.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// CLI entry
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.CONTROL_PLANE_PORT ?? 4000);
  startControlPlane(port)
    .then(async (cp) => {
      // eslint-disable-next-line no-console
      console.log(`agentMom control plane on http://localhost:${cp.port}/api  (ws :/live)`);
      if (process.env.SPAWN_DEMO === "1") {
        await cp.spawnDemoTopology();
        console.log("demo topology spawned: agent-A..D");
      }
      process.on("SIGINT", async () => {
        await cp.close();
        process.exit(0);
      });
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
