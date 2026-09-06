import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveEvent } from "../lib/ws-client";
import type { AgentDescriptor } from "../lib/api-client";

// Live SVG topology. Nodes are the demo agents; edges are drawn between agents
// that share a multicast group; packets animate along an edge whenever a message
// flows. Scope honesty (§9.4): a packet on a broadcast evidences HOST-LOCAL
// reach only — not 3.2.3.3's LAN-wide claim.

const POS: Record<string, { x: number; y: number }> = {
  "agent-A": { x: 150, y: 170 },
  "agent-B": { x: 470, y: 58 },
  "agent-C": { x: 470, y: 282 },
  "agent-D": { x: 830, y: 170 },
};
const FALLBACK = { x: 490, y: 170 };
const pos = (id: string) => POS[id] ?? FALLBACK;

interface Flow { id: number; from: string; to: string; kind: string; }
let flowSeq = 0;

export function AgentTopologyGraph({ agents, events }: { agents: AgentDescriptor[]; events: LiveEvent[] }) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [hot, setHot] = useState<Record<string, number>>({});
  const lastSeen = useRef(0);

  useEffect(() => {
    const fresh = events.filter((e) => e.ts > lastSeen.current);
    if (fresh.length) lastSeen.current = fresh[fresh.length - 1].ts;

    for (const e of fresh) {
      const p = e.payload;
      const from = String(p["senderId"] ?? p["agentId"] ?? "");
      if (e.type === "MESSAGE_SENT" && from) {
        let targets: string[] = [];
        if (p["recipientId"]) targets = [String(p["recipientId"])];
        else if (p["mode"] === "multicast" && p["groupAddress"]) {
          targets = agents.filter((a) => a.memberships.includes(String(p["groupAddress"])) && a.agentId !== from).map((a) => a.agentId);
        } else if (p["mode"] === "broadcast") {
          targets = agents.filter((a) => a.agentId !== from).map((a) => a.agentId);
        }
        const kind = String(p["mode"] ?? "unicast");
        setFlows((prev) => [
          ...prev.slice(-14),
          ...targets.map((to) => ({ id: ++flowSeq, from, to, kind })),
        ]);
      }
      if ((e.type === "MESSAGE_RECEIVED" || e.type === "MESSAGE_SENT") && (p["agentId"] || from)) {
        const who = String(p["agentId"] ?? from);
        setHot((h) => ({ ...h, [who]: Date.now() }));
      }
    }
  }, [events, agents]);

  useEffect(() => {
    const t = setInterval(() => {
      setFlows((prev) => prev.slice(-8));
      setHot((h) => ({ ...h }));
    }, 900);
    return () => clearInterval(t);
  }, []);

  const edges = useMemo(() => {
    const out: Array<{ a: string; b: string; group?: string }> = [];
    const ids = agents.map((a) => a.agentId);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const shared = agents[i].memberships.find((g) => agents[j].memberships.includes(g));
        out.push({ a: ids[i], b: ids[j], group: shared });
      }
    }
    return out;
  }, [agents]);

  return (
    <svg className="topo" viewBox="0 0 980 340" preserveAspectRatio="xMidYMid meet" role="img" aria-label="agent topology">
      {edges.map((e, i) => {
        const A = pos(e.a), B = pos(e.b);
        const cls = e.group === "239.1.1.5" ? "edge alpha" : e.group === "239.1.1.6" ? "edge beta" : "edge";
        return <line key={i} className={cls} x1={A.x} y1={A.y} x2={B.x} y2={B.y} />;
      })}

      {flows.map((f) => {
        const A = pos(f.from), B = pos(f.to);
        const color = f.kind === "multicast" ? "var(--accent)" : f.kind === "broadcast" ? "var(--pink)" : "var(--cyan)";
        return (
          <circle key={f.id} className="packet" r="4.5" cx={A.x} cy={A.y} style={{ fill: color }}>
            <animateMotion dur="0.7s" fill="freeze" repeatCount="1" path={`M ${A.x} ${A.y} L ${B.x} ${B.y}`} />
          </circle>
        );
      })}

      {agents.map((a) => {
        const P = pos(a.agentId);
        const isHot = Date.now() - (hot[a.agentId] ?? 0) < 900;
        const cls = `node-c${isHot ? " hot" : ""}${a.role === "key-holder" ? " keyholder" : ""}`;
        return (
          <g key={a.agentId}>
            {a.memberships.map((g, k) => (
              <circle key={g} className="halo" r={30 + k * 7} cx={P.x} cy={P.y}
                style={{ stroke: g === "239.1.1.5" ? "var(--accent)" : "var(--accent-2)" }} />
            ))}
            <circle className={cls} r="24" cx={P.x} cy={P.y} />
            <text x={P.x} y={P.y + 3} textAnchor="middle">{a.agentId.replace("agent-", "")}</text>
            <text className="sub" x={P.x} y={P.y + 44} textAnchor="middle">
              {a.role === "key-holder" ? "key-holder" : a.architectureMode.replace("-controlled", "")}
            </text>
            <text className="sub" x={P.x} y={P.y - 34} textAnchor="middle">:{a.unicastPort}</text>
          </g>
        );
      })}
    </svg>
  );
}
