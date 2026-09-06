import type { MutableRefObject } from "react";
import type { AgentDescriptor } from "../lib/api-client";
import type { LiveEvent } from "../lib/ws-client";

export interface PageProps {
  agents: AgentDescriptor[];
  events: LiveEvent[];
  eventsRef: MutableRefObject<LiveEvent[]>;
  refresh: () => void;
}

export const GROUPS = ["239.1.1.5", "239.1.1.6"] as const;
