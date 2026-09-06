import type { MembershipState } from "@agentmom/core";

// FR2 — §9.2. BR-04..07.
//
// The application-level membership set is held here, INDEPENDENT of the OS join
// call, because BR-04/BR-05 must hold even when the OS join is still in flight
// or the process is mid-startup. Every inbound datagram is checked against this
// set before it reaches the application layer.
//
// State machine:
//   NOT_MEMBER --join()--> JOINING --(addMembership resolves)--> MEMBER
//   MEMBER     --leave()--> NOT_MEMBER   (set update synchronous; see BR-06)

export class GroupMembershipManager {
  private readonly state = new Map<string, MembershipState>();

  stateOf(groupAddress: string): MembershipState {
    return this.state.get(groupAddress) ?? "NOT_MEMBER";
  }

  joined(): string[] {
    return [...this.state.entries()]
      .filter(([, s]) => s === "MEMBER")
      .map(([g]) => g);
  }

  beginJoin(groupAddress: string): void {
    this.state.set(groupAddress, "JOINING");
  }

  completeJoin(groupAddress: string): void {
    this.state.set(groupAddress, "MEMBER");
  }

  // BR-06 — leave() removes the group from the application-level membership set
  // SYNCHRONOUSLY, BEFORE the OS dropMembership call. A datagram already in
  // flight is dropped, not delivered. This window is the DELIBERATELY CHOSEN
  // behaviour (A2.1), not a race we stumbled into.
  leaveSync(groupAddress: string): void {
    this.state.set(groupAddress, "NOT_MEMBER");
  }

  // BR-04 / BR-05 — an agent must not receive multicast traffic for a group it
  // has not joined, or has left.
  isDeliverable(groupAddress: string): boolean {
    return this.stateOf(groupAddress) === "MEMBER";
  }
}
