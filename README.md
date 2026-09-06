# agentMom

**SE3002 Assignment 01 — Quality Evaluation of AI-Generated Software.**
A developer framework for broadcasting / multicasting / secured communication in
multi-agent systems, built to the locked 10-requirement scope in
[`docs/agentmom-implementation-plan-v2.md`](docs/agentmom-implementation-plan-v2.md).

Team: M. Bilal Tahir (24i-3166), Taimoor Shaukat (24i-3015) — Section SE-B.

---

## What this is

Every agent is a **real OS process** (`fork()`) with real sockets:
one TCP listener for unicast, one UDP socket **per joined multicast group**, one
UDP broadcast socket. A single-process **control plane** spawns/kills agents and
exposes a REST + WebSocket API. A **Vite + React harness** drives it and shows
observable success/error feedback per requirement (assumption **A11** — the GUI
is a test harness over the framework, not a product UI).

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+ / TypeScript (declared deviation from SRS Java — see §5.1 of the plan and **A8.2**) |
| Transport | native `net` (TCP) + `dgram` (UDP) — CON-01, no simulation bus |
| Crypto | Node `crypto`, AES-256-GCM (**A5.1**) |
| Test runner | Vitest (+ supertest), lcov for SonarQube |
| Harness | Vite + React |

## Requirements → code map

| Req | Handle | Key files |
|---|---|---|
| FR1 | unicast | `packages/agent/src/transports/unicast-transport.ts`, `packages/core/src/protocol/{unicast-framing,sequence-checker}.ts` |
| FR2 | multicast membership | `packages/agent/src/membership/group-membership-manager.ts`, `.../transports/multicast-transport.ts` |
| FR3 | multicast messaging + TTL | `.../transports/multicast-transport.ts`, `packages/core/src/protocol/multicast-framing.ts`, `packages/core/src/constants.ts` |
| FR4 | broadcast | `packages/agent/src/transports/broadcast-transport.ts` |
| FR5 | unicast security | `packages/agent/src/security/unicast-security.ts`, `packages/core/src/crypto/symmetric.ts`, `.../validation/envelope-validator.ts` |
| FR6 | multicast security | `packages/agent/src/key-holder/key-holder-agent.ts`, `.../security/multicast-security.ts`, `packages/core/src/crypto/key-holder-protocol.ts` |
| FR7 | conversation architecture | `packages/agent/src/architecture/*.ts` |
| NFR8 | 1.2 compatibility | `packages/agent/src/legacy/agentmom-1_2-adapter.ts` |
| NFR9 | best-effort reliability | `packages/agent/src/reliability/best-effort-simulator.ts` + *absence of retry paths* |
| NFR10 | basic security only | discipline — verified by inspection (`ASSUMPTIONS.md` A10.2, BR-24) |

See [`ASSUMPTIONS.md`](ASSUMPTIONS.md) (24 entries) and
[`TEST-CONDITIONS.md`](TEST-CONDITIONS.md) (54 conditions) and
[`TRACEABILITY.md`](TRACEABILITY.md) (Table C skeleton — every non-system condition
mapped to a Table B case or a test file; enforced by a meta-test), and
[`DEVIATIONS.md`](DEVIATIONS.md) (every difference from the plan, declared).

## Setup

```bash
node -v          # must be >= 20
npm install      # installs all workspaces
npm run build    # tsc -b for core, agent, control-plane
```

## Run

```bash
npm run dev-up
```

This builds, starts the control plane on **:4000** with the four-agent demo
topology (agent-A…D mirroring SRS Figures 1–4), and starts the harness on
**http://localhost:5173**.

Manual, without the script:

```bash
SPAWN_DEMO=1 node packages/control-plane/dist/main.js   # terminal 1
npm --workspace @agentmom/web run dev                   # terminal 2
```

Demo topology:

| Agent | Role | Unicast | Groups at start | SRS figure role |
|---|---|---|---|---|
| agent-A | standard | 7001 | none | initiates unicast (Fig. 2), joins α mid-demo (Fig. 1) |
| agent-B | standard | 7002 | α | leaves α mid-demo (Fig. 1) |
| agent-C | standard | 7003 | α, β | member throughout (Fig. 3), BR-07 multi-group |
| agent-D | key-holder | 7004 | α | holds/distributes group keys (2.5.3), broadcast recipient |

Groups: α `239.1.1.5:5007`, β `239.1.1.6:5008`. Broadcast port `9001`
(`reuseAddr` — all four agents share it).

## Test

```bash
npm run verify        # typecheck + build + all tests + coverage + web build (the full gate)
npm test              # all levels: unit + component + integration
npm run coverage      # emits coverage/lcov.info for SonarQube
npm run test:unit
npm run test:component
npm run test:integration
```

122 automated tests across 18 files. Four test levels (§12 of the plan). Unit + component + integration are
**automated inside the frozen baseline**. System-level cases (SRS UC1–UC4) are
**manual, per the brief** — they are not in the automated suite.

- Unit — pure functions (framing, crypto, TTL predicate, sequence check, key
  derivation, envelope validation).
- Component — one module with real sockets on loopback.
- Integration — 2+ real agent processes + control plane, no UI.

Integration suites fork agents on the fixed demo ports, so `vitest.config.ts`
sets `fileParallelism: false`.

### Coverage

Overall ~85% lines. The agent orchestrator (`packages/agent/src/agent.ts`, ~88%)
is driven directly by the component suite (`agent-orchestration.test.ts`) with a
stub `send`, so it is measured rather than lost to v8's forked-child blind spot
(plan §12.4 — see [`DEVIATIONS.md`](DEVIATIONS.md) D-4). Only the ~25-line
forked-child bootstrap `packages/agent/src/main.ts` is excluded from the report.

### CON-04 / CON-05 and the automated suite

Integration cases that need a datagram to *actually arrive* (multicast/broadcast
delivery) probe the host at start-up (`helpers.ts`) and **SKIP with a BLOCKED
note** where loopback multicast/broadcast is unavailable — matching §18.1's
"unmet precondition → BLOCKED, not FAILED". Drop / gate / boundary / negative
cases always run. So `npm test` is green on any machine.

### Machine-checked Definition of Done

`packages/core/tests/unit/dod.test.ts` and `traceability.test.ts` enforce plan
§20 as tests: 24 assumptions each with a findable comment in the file
`ASSUMPTIONS.md` names, 54 conditions all traced (zero Table-C orphans), the
three-label rule, the "sent to / not reaches" wording discipline (§20.8), and
the §21 non-goals (no DB / auth / retry layer). These fail the build on
regression.

## Preconditions (before any test session)

```bash
bash scripts/verify-preconditions.sh
```

Reports CON-04 (multicast support) and CON-05 (broadcast permission) status.
This is a **single-host** test bed — SRS 3.2.3.3's "all possible hosts under the
same local network" cannot be established here, which is why **TC-11 is BLOCKED**
(not FAILED). Similarly TC-08 (`setMulticastTTL(0)` confinement) is expected to
**FAIL** because same-host delivery traverses no router — this is deliberate and
must not be worked around (plan §14.1, §21).

## Freeze

```bash
bash scripts/freeze-baseline.sh   # git tag baseline-v1, zip packages/
```

After the freeze the baseline is immutable; SonarQube and test evidence are
collected against the `baseline-v1` tag. Post-freeze fixes are committed on
`main` and the tag is **not** moved.

## Repository layout

```
packages/core           shared types, crypto, framing, validation  (build first)
packages/agent           the agent process: transports, membership, security, ...
packages/control-plane   Express + ws, agent supervisor, log aggregator
packages/web             Vite + React harness (A11)
scripts/                 dev-up, spawn-demo-agents, verify-preconditions, freeze-baseline
evidence/                populated in Phases 12–14 — NOT part of the frozen tree
docs/                    the SRS-derived plan and assignment reports
```
