import { useEffect, useState } from "react";
import { api } from "../lib/api-client";
import { ReliabilityDial } from "../components/ReliabilityDial";
import { MessageLog } from "../components/MessageLog";
import type { PageProps } from "./types";

export function Admin({ events }: PageProps) {
  const [ttl, setTtl] = useState(1);
  const [crypto, setCrypto] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.crypto().then(setCrypto).catch(() => setCrypto(null));
  }, []);

  return (
    <div>
      <h2>Admin — NFR9 (reliability), NFR10 (security readout)</h2>

      <h3>Reliability dial (NFR9 demo aid)</h3>
      <ReliabilityDial onChange={(r) => api.setReliability(r)} />

      <h3>Default TTL (A3.1 demo — UNSUPPORTED assumption)</h3>
      <label>
        default TTL{" "}
        <input type="number" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} style={{ width: 60 }} />
      </label>{" "}
      <button onClick={() => api.setDefaultTtl(ttl)}>apply</button>
      <p style={{ fontSize: 12, color: "#666" }}>
        The constant is <code>DEFAULT_TTL_UNSUPPORTED_ASSUMPTION = 1</code>. The SRS is silent
        on a default TTL — this is a flagged non-SRS value, not a magic number.
      </p>

      <h3>Crypto configuration readout (NFR10)</h3>
      <pre style={{ fontSize: 12 }}>{crypto ? JSON.stringify(crypto, null, 2) : "…"}</pre>
      <p style={{ fontSize: 12, color: "#666" }}>
        Basic encryption only (2.4.2). No strength, key-length or resistance claim is made
        (BR-24, A10.2).
      </p>

      <MessageLog events={events} filter={(e) => e.type.includes("DROPPED") || e.type.includes("TTL")} />
    </div>
  );
}
