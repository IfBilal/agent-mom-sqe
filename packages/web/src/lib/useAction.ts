import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { BadgeState } from "../components/StatusBadge";
import type { LiveEvent } from "./ws-client";

export interface ActionStatus {
  state: BadgeState;
  event?: string;
  detail?: string;
}

// Runs an action, then watches the live event stream for a confirming or
// failing event. Every expected result is asserted about FRAMEWORK behaviour
// observed through the harness (A11) — never about the harness itself.
export function useAction(
  eventsRef: MutableRefObject<LiveEvent[]>,
  opts: { success: string[]; failure: string[]; windowMs?: number },
) {
  const [status, setStatus] = useState<ActionStatus>({ state: "idle" });

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      const since = Date.now();
      setStatus({ state: "pending" });
      try {
        await fn();
      } catch (err) {
        setStatus({ state: "failure", event: "REQUEST_REJECTED", detail: (err as Error).message });
        return;
      }
      const deadline = Date.now() + (opts.windowMs ?? 2500);
      const poll = () => {
        const relevant = eventsRef.current.filter((e) => e.ts >= since);
        const fail = relevant.find((e) => opts.failure.includes(e.type));
        if (fail) return setStatus({ state: "failure", event: fail.type, detail: JSON.stringify(fail.payload).slice(0, 120) });
        const ok = relevant.find((e) => opts.success.includes(e.type));
        if (ok) return setStatus({ state: "success", event: ok.type });
        if (Date.now() < deadline) setTimeout(poll, 150);
        else setStatus({ state: "pending", detail: "no confirming event observed in window" });
      };
      setTimeout(poll, 200);
    },
    [eventsRef, opts],
  );

  return { status, run };
}
