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

  /* v8 ignore next -- no-op until the ws hub is wired after listen() */
  const hub: { publish: (e: LiveEvent) => void } = { publish: () => void 0 };
  const log = new LogAggregator();
  let registry: AgentRegistry;
  const supervisor = new AgentSupervisor((event) => {
    log.ingest(event);
    registry.applyEvent(event);
    hub.publish(event);
  });
  registry = new AgentRegistry(supervisor);


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

  const ctx: RouteContext = { supervisor, registry, log, allowList: DEMO_ALLOWLIST, spawnDemoTopology };

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", agentsRoutes(ctx));
  app.use("/api", messagesRoutes(ctx));
  app.use("/api", groupsRoutes(ctx));
  app.use("/api", keysRoutes(ctx));
  app.use("/api", adminRoutes(ctx));

  const server = http.createServer(app);

  // Bind first. Only attach the WebSocket server once the port is actually ours,
  // so a listen failure (EADDRINUSE / EACCES) rejects cleanly instead of leaving
  // an unhandled 'error' on a half-wired ws server.
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port);
  });
  const actualPort = (server.address() as { port: number }).port;

  const liveHub = new LiveEventHub(server);
  hub.publish = (e) => liveHub.publish(e);

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

export interface CliOptions {
  port?: number;
  spawnDemo?: boolean;
  registerSignals?: boolean;
  log?: (message: string) => void;
}

/**
 * Boots the control plane the way the CLI does — resolved port, optional demo
 * topology, orderly-shutdown signal handlers. Exported (not inlined in the
 * entry guard) so it is exercised by the test suite rather than left as an
 * uncovered process shim.
 */
export async function runCli(opts: CliOptions = {}): Promise<RunningControlPlane> {
  /* v8 ignore next -- console.log fallback; tests inject a capturing logger */
  const log = opts.log ?? ((m: string) => console.log(m));
  const port = opts.port ?? Number(process.env.CONTROL_PLANE_PORT ?? 4000);

  const cp = await startControlPlane(port);
  log(`agentMom control plane on http://localhost:${cp.port}/api  (ws :/live)`);

  if (opts.spawnDemo ?? process.env.SPAWN_DEMO === "1") {
    await cp.spawnDemoTopology();
    log("demo topology spawned: agent-A..D");
  }

  // Kill the forked agents on any orderly shutdown signal, so a stopped control
  // plane never leaves orphan agents holding ports 7001–7004.
  if (opts.registerSignals ?? true) {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
      /* v8 ignore next 3 -- signal callback cannot run under the test runner without killing it */
      process.once(signal, () => {
        void cp.close().then(() => process.exit(0));
      });
    }
  }

  return cp;
}

/* v8 ignore start -- process entry guard, not logic */
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
/* v8 ignore stop */
