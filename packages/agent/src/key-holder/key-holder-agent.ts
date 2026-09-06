import { newGroupKey } from "@agentmom/core";

// FR6 — §9.6. BR-18, BR-20.
//
// AI ASSUMPTION A6.1 — Supported by SRS (2.5.3): a key holder exists and gates
// group-key distribution by an allow-list.
//
// Allow-list ≠ current membership. SRS 2.5.3 says the key holder maintains a
// list of agents ALLOWED TO GET THE KEYS — not a list of current members. The
// two can legitimately diverge; this models the allow-list.
//
// AI ASSUMPTION A6.2 — classified UNSUPPORTED in the Part 1 report.
// The key holder issues one static group key to every allow-listed agent and
// never rotates or revokes it on leave. A departed agent retains the ability to
// decrypt group traffic. Deliberate simplification, not an oversight. The SRS
// is silent on rotation.

export interface KeyGrant {
  granted: boolean;
  groupKeyBase64?: string;
  reason?: string;
}

export class KeyHolderAgent {
  private readonly allowList = new Map<string, Set<string>>();
  private readonly groupKeys = new Map<string, Buffer>();

  constructor(allowList: Record<string, string[]> = {}) {
    for (const [group, agents] of Object.entries(allowList)) {
      this.allowList.set(group, new Set(agents));
      this.groupKeys.set(group, newGroupKey()); // generated once at startup per group
    }
  }

  allowListFor(groupAddress: string): string[] {
    return [...(this.allowList.get(groupAddress) ?? [])];
  }

  ensureGroup(groupAddress: string): void {
    if (!this.groupKeys.has(groupAddress)) this.groupKeys.set(groupAddress, newGroupKey());
    if (!this.allowList.has(groupAddress)) this.allowList.set(groupAddress, new Set());
  }

  // BR-18 — the group key is issued only to agents on the allow-list.
  handleRequest(requestingAgentId: string, groupAddress: string): KeyGrant {
    this.ensureGroup(groupAddress);
    const allowed = this.allowList.get(groupAddress)!.has(requestingAgentId);
    if (!allowed) {
      return { granted: false, reason: `${requestingAgentId} is not on the allow-list for ${groupAddress}` };
    }
    return { granted: true, groupKeyBase64: this.groupKeys.get(groupAddress)!.toString("base64") };
  }

  ownKey(groupAddress: string): string | undefined {
    return this.groupKeys.get(groupAddress)?.toString("base64");
  }

  // BR-20 — leave() triggers NO key rotation, revocation or re-issue.
  onLeave(_agentId: string, _groupAddress: string): void {
    /* intentionally empty — A6.2 */
  }
}
