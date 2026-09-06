import { useEffect, useState } from "react";
import { api } from "../lib/api-client";
import { ReliabilityDial } from "../components/ReliabilityDial";
import { MessageLog } from "../components/MessageLog";
import type { PageProps } from "./types";

interface CryptoInfo {
  algorithm: string;
  note: string;
  unicastKeyModel: string;
  multicastKeyModel: string;
}

export function Admin({ events }: PageProps) {
  const [ttl, setTtl] = useState(1);
  const [crypto, setCrypto] = useState<CryptoInfo | null>(null);

  useEffect(() => {
    api.crypto().then((c) => setCrypto(c as unknown as CryptoInfo)).catch(() => setCrypto(null));
  }, []);

  return (
    <div>
      <h2>Admin</h2>
      <p className="muted">Reliability simulation and cryptography configuration.</p>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Packet-loss simulation</h3>
        <ReliabilityDial onChange={(r) => api.setReliability(r)} />
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Default TTL</h3>
        <div className="row tight">
          <label>default TTL <input type="number" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} style={{ width: 70 }} /></label>
          <button className="btn secondary" onClick={() => api.setDefaultTtl(ttl)}>apply</button>
        </div>
        <p className="muted">
          The default is 1. The original spec does not define a default TTL, so this value is an
          explicit assumption.
        </p>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Cryptography</h3>
        {crypto && (
          <table className="grid">
            <tbody>
              <tr><td>algorithm</td><td className="mono">{crypto.algorithm}</td></tr>
              <tr><td>unicast keys</td><td>{crypto.unicastKeyModel}</td></tr>
              <tr><td>group keys</td><td>{crypto.multicastKeyModel}</td></tr>
            </tbody>
          </table>
        )}
        <p className="muted" style={{ marginBottom: 0 }}>{crypto?.note}</p>
      </div>

      <h3>Drop / TTL log</h3>
      <MessageLog events={events} filter={(e) => e.type.includes("DROPPED") || e.type.includes("TTL")} />
    </div>
  );
}
