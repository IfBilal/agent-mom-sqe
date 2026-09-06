import { randomInt } from "node:crypto";
import type { TransportMode } from "@agentmom/core";

// NFR9 — §9.9. DEMO AID ONLY.
//
// Applies to MULTICAST and BROADCAST only. Never to unicast, which is
// TCP-backed and reliable by construction; conflating them would contradict
// both CON-02 and A1.2.
//
// Hard rule (§9.4 / §9.9): a drop the app handles correctly is a PASS, never
// evidence of a FAILED case.
//
// crypto.randomInt is used rather than Math.random so SonarQube S2245 does not
// flag it — see §16 finding #2. This is not security-relevant either way; it
// seeds a demo aid, not a key.
export class BestEffortSimulator {
  private dropRate = 0; // 0.0–1.0, default 0 — no loss unless explicitly dialled in

  setDropRate(rate: number): void {
    this.dropRate = Math.min(1, Math.max(0, rate));
  }

  getDropRate(): number {
    return this.dropRate;
  }

  // Returns true if THIS send should be dropped. Checked immediately before
  // each multicast/broadcast send. On drop: log SIMULATED_DROP, skip the send.
  // No retry (BR-23).
  shouldDrop(mode: TransportMode): boolean {
    if (mode === "unicast") return false;
    if (this.dropRate <= 0) return false;
    if (this.dropRate >= 1) return true;
    return randomInt(0, 1_000_000) < this.dropRate * 1_000_000;
  }
}
