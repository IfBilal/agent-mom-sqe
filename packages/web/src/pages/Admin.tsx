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
      <h2>Admin <span className="req-chip">NFR9 reliability · NFR10 security readout</span></h2>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Reliability dial <span className="muted">(NFR9 demo aid)</span></h3>
        <ReliabilityDial onChange={(r) => api.setReliability(r)} />
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Default TTL <span className="muted">(A3.1 demo — UNSUPPORTED assumption)</span></h3>
        <div className="row tight">
          <label>default TTL <input type="number" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} style={{ width: 70 }} /></label>
          <button className="btn secondary" onClick={() => api.setDefaultTtl(ttl)}>apply</button>
        </div>
        <p className="muted">
          The constant is <code>DEFAULT_TTL_UNSUPPORTED_ASSUMPTION = 1</code>. The SRS is silent on a
          default TTL — this is a flagged non-SRS value, not a magic number.
        </p>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Crypto configuration readout <span className="muted">(NFR10)</span></h3>
        <pre className="readout">{crypto ? JSON.stringify(crypto, null, 2) : "…"}</pre>
        <p className="muted">
          Basic encryption only (2.4.2). No strength, key-length or resistance claim is made
          (BR-24, A10.2).
        </p>
      </div>

      <h3>Drop / TTL log</h3>
      <MessageLog events={events} filter={(e) => e.type.includes("DROPPED") || e.type.includes("TTL")} />
    </div>
  );
}
