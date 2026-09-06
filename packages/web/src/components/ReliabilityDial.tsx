import { useState } from "react";

// NFR9 demo aid. Label per §9.9 — a drop the app handles correctly is a PASS,
// never evidence of a FAILED case.
export function ReliabilityDial({ onChange }: { onChange: (rate: number) => void }) {
  const [rate, setRate] = useState(0);
  return (
    <div>
      <label>
        drop rate: <strong>{(rate * 100).toFixed(0)}%</strong>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={rate}
          onChange={(e) => {
            const v = Number(e.target.value);
            setRate(v);
            onChange(v);
          }}
        />
      </label>
      <p className="muted">
        Simulates packet loss for NFR 2.4.1 observation. Default 0%. Real UDP loss
        can occur independently of this control. Applies to multicast / broadcast
        only — never unicast.
      </p>
    </div>
  );
}
