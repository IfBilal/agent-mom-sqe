# DEVIATIONS.md — where the build differs from the plan, and why

Every deviation is declared here rather than hidden (plan §0 standing rule).

## D-1 — Language: Node.js/TypeScript, not Java 1.4.0

**Plan:** §5.1 declares this. **SRS:** §2.1 / §2.1.1 / CON-09 require Java 1.4.0.
**Consequence:** NFR8's evaluation is structurally invalid — a self-authored contract
(A8.2, Unsupported) inspected against an implementation we also authored. Declared in
`ASSUMPTIONS.md` (A8.2) and surfaced in the Compatibility harness page and the Part 3A
limitation column. This is the intended trade (the assignment is a *quality evaluation*
exercise; the limitation converts to a legitimate finding, not a fabricated pass).

## D-2 — Harness: Vite + React, not Next.js

**Plan:** §5.2 + changelog item #25 explicitly make this change *away from* Next.js, to
keep framework scaffolding out of the SonarQube scan so Part 3A's "~5 meaningful findings"
selection stays clean. The build follows the plan.

## D-3 — `SequenceChecker` pure class lives in `packages/core`, not `packages/agent`

**Plan tension:** §6's repository tree lists `sequence-checker.ts` under `packages/agent/src`,
but §13 and the Phase 0 test list place **COND-08 in `packages/core/tests/unit`**. These
are inconsistent in the plan itself.

**Resolution:** the *pure, side-effect-free* `SequenceChecker` class lives in
`packages/core/src/protocol/sequence-checker.ts` so the unit test can exercise it with no
socket, matching §13's test placement. `packages/agent/src/sequence-checker.ts` remains as
the §6-named module and re-exports it, so the agent's receive path still imports
`./sequence-checker.js` exactly as the plan describes. BR-02/BR-03 behaviour is unchanged.

## D-4 — `Agent` orchestrator split from the forked-child bootstrap

**Plan:** §6 names `agent/src/main.ts`. **Build:** `main.ts` is now a ~25-line bootstrap;
all orchestration is in `agent/src/agent.ts` (the `Agent` class), constructed with an
injectable `send` callback.

**Why:** plan §12.4 warns that v8 does not instrument forked child processes, so
integration coverage of the agent "silently reads as zero." Extracting `Agent` lets the
component suite (`agent-orchestration.test.ts`) drive it directly with a stub `send`,
giving real, measured coverage (agent.ts ≈ 81% lines). No behaviour changed.

## D-5 — Loopback multicast

Single-host demo (CON-04). Agents bind `0.0.0.0:<group port>` with `reuseAddr`,
`addMembership(group, "127.0.0.1")`, `setMulticastInterface("127.0.0.1")`,
`setMulticastLoopback(true)`. Delivery is observed working on the dev host; tests that
depend on cross-process loopback delivery assert defensively (they verify the drop/gate
behaviour when a datagram *is* received, and the boundary conditions are covered at unit
level regardless). Router/NIC scope is out of reach here — that is TC-08 (FAILED) and
TC-11 (BLOCKED) territory, both declared.
