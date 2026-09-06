// BR-02 / BR-03 live here per §6. The pure logic is in @agentmom/core so the
// unit test (COND-08) can exercise it without a socket; this module re-exports
// it for the agent's receive path.
export { SequenceChecker } from "@agentmom/core";
export type { SequenceObservation } from "@agentmom/core";
