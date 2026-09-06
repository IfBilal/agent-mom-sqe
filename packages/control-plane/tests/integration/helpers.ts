import { startControlPlane, type RunningControlPlane } from "../../src/main.js";

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
