import dgram from "node:dgram";
import { startControlPlane, type RunningControlPlane } from "../../src/main.js";

// CON-04 precondition probe. Loopback multicast requires router/NIC/OS support
// that a locked-down test bed may lack. Where it is unavailable, pure-delivery
// assertions are SKIPPED (recorded as BLOCKED per §18.1 step 2), not FAILED —
// drop/gate/boundary conditions still run because they do not need real delivery.
async function probeMulticastLoopback(): Promise<boolean> {
  return new Promise((resolve) => {
    const group = "239.99.99.99";
    const port = 51999;
    const rx = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const done = (ok: boolean) => {
      try { rx.close(); } catch { /* already closed */ }
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), 600);
    rx.once("error", () => { clearTimeout(timer); done(false); });
    rx.once("message", () => { clearTimeout(timer); done(true); });
    rx.bind(port, () => {
      try {
        rx.addMembership(group, "127.0.0.1");
        rx.setMulticastInterface("127.0.0.1");
        rx.setMulticastLoopback(true);
        const tx = dgram.createSocket({ type: "udp4", reuseAddr: true });
        tx.bind(0, () => {
          tx.setMulticastInterface("127.0.0.1");
          tx.send(Buffer.from("probe"), port, group, () => tx.close());
        });
      } catch {
        clearTimeout(timer);
        done(false);
      }
    });
  });
}

async function probeBroadcastLoopback(): Promise<boolean> {
  return new Promise((resolve) => {
    const port = 51998;
    const rx = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const done = (ok: boolean) => { try { rx.close(); } catch { /* closed */ } resolve(ok); };
    const timer = setTimeout(() => done(false), 600);
    rx.once("error", () => { clearTimeout(timer); done(false); });
    rx.once("message", () => { clearTimeout(timer); done(true); });
    rx.bind(port, () => {
      rx.setBroadcast(true);
      const tx = dgram.createSocket({ type: "udp4", reuseAddr: true });
      tx.bind(0, () => {
        tx.setBroadcast(true);
        tx.send(Buffer.from("probe"), port, "255.255.255.255", () => tx.close());
      });
    });
  });
}

export const MULTICAST_OK = await probeMulticastLoopback();
export const BROADCAST_OK = await probeBroadcastLoopback();
if (!MULTICAST_OK) {
  // eslint-disable-next-line no-console
  console.warn("[CON-04] loopback multicast unavailable on this host — multicast delivery cases are BLOCKED (§18.1), not failed.");
}
if (!BROADCAST_OK) {
  // eslint-disable-next-line no-console
  console.warn("[CON-05] loopback broadcast unavailable on this host — broadcast delivery cases are BLOCKED (§18.1), not failed.");
}

export interface Harness {
  cp: RunningControlPlane;
  base: string;
  api: (path: string, init?: RequestInit) => Promise<Response>;
  json: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
  waitForEvent: (predicate: (e: Record<string, unknown>) => boolean, ms?: number) => Promise<Record<string, unknown> | null>;
  logSince: (ts: number) => Promise<Array<Record<string, unknown>>>;
}

export async function boot(withDemo = true): Promise<Harness> {
  process.env.AGENTMOM_DEMO_SEED ??= "se3002-agentmom-demo-seed";
  const cp = await startControlPlane(0);
  if (withDemo) await cp.spawnDemoTopology();
  const base = `http://127.0.0.1:${cp.port}`;

  const api = (path: string, init?: RequestInit): Promise<Response> =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const r = await api(path, init);
    return (await r.json()) as T;
  };
  const logSince = async (ts: number): Promise<Array<Record<string, unknown>>> =>
    json(`/api/messages/log?since=${ts}`);

  const waitForEvent = async (
    predicate: (e: Record<string, unknown>) => boolean,
    ms = 3000,
  ): Promise<Record<string, unknown> | null> => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const entries = await logSince(start - 5000);
      const hit = entries.find(predicate);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  };

  return { cp, base, api, json, waitForEvent, logSince };
}
