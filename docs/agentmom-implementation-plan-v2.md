# agentMom — Implementation & Quality Evidence Plan
## v2.0 — Build Specification + Test Architecture (for Claude Code)

**Project:** SE3002 Assignment 01 — Quality Evaluation of AI-Generated Software
**Base SRS:** "Applying Broadcasting/Multicasting/Secured Communication to agentMom in Multi-Agent Systems," v1.1 (Mekprasertvit, Kansas State University, Spring 2003)
**Team:** M. Bilal Tahir (24i-3166), Taimoor Shaukat (24i-3015) — Section SE-B
**Supersedes:** `agentmom-implementation-plan.md` v1

---

## 0. What changed from v1, and why

v1 was a build spec only. It had requirement→code traceability but no test architecture, and three defects that would have cost real marks. This version fixes them and extends the plan through Parts 3 and 4.

| # | v1 problem | Fix in v2 |
|---|---|---|
| 1 | **§3 multicast port design was wrong.** Each agent bound a different port (8001–8004). IP multicast delivers on *(group address, destination port)* — an agent bound to 8002 never sees traffic sent to `:5007`. FR2 and FR3 could not have worked, and would have failed silently. | §7: all group members bind the **same** group port with `reuseAddr`. The per-agent ports are repurposed as control/IPC ports. |
| 2 | **§10 forbade automated tests.** Misread the brief — it says system-level cases must be manual and that automation "is not expected," not that it is forbidden. Cost: no coverage metric, which Part 3A names as evidence. | §12–14: four-level test architecture. Unit/component/integration automated **inside** the frozen baseline; system-level manual, as required. |
| 3 | **Every failure mode was pre-handled**, so a correctly built app yields zero genuine FAILED tests — leaving no honest way to satisfy Part 3B's "≥2 genuine FAILED or BLOCKED." | §14: two authentic failures identified in advance (TC-08 FAILED, TC-11 BLOCKED) and deliberately **not** engineered away. Simulation toggles are retained for demos but are barred from being cited as failure evidence. |
| 4 | No test basis → condition → case → result → defect chain. | §12–15: full chain, 53 conditions, 15 reported cases, traceability matrix. |
| 5 | No `reuseAddr`, no multicast loopback, no broadcast fallback address. | §9.2–9.4. |
| 6 | Freeze happened before any test existed. | §19: corrected build → freeze → scan → test → triage sequence. |
| 7 | SonarQube findings unanticipated. | §16: six predicted findings with prepared interpretations. |
| 8 | 3.2.2.9 sat under multicast *messaging*; its behaviour cannot be isolated from join. | Moved to FR2 (membership). FR2 = 5 sub-reqs, FR3 = 4. |
| 9 | Next.js 14 pulled framework noise into the SonarQube scan. | Vite + React. |
| 10 | NFR8 was structurally unsatisfiable and this was not declared. | §17: evaluated by contract inspection with the invalidity stated as a limitation. |

**Standing rule for whoever builds this, including Claude Code:** follow the phases in order; each ends runnable. Do not extend scope beyond §1. If the SRS implies behaviour not covered here, **flag it rather than inventing it** — every invented behaviour must appear in the assumption register (§4) with one of exactly three labels. When you hit an unspecified decision, make the call §4 already made, so the code and the report never diverge.

---

## 1. Locked requirement scope

The 10 rows below are final. Every line of code maps to one of them. Nothing else is built.

| # | Req. ID(s) | Type | Handle | Behaviour |
|---|---|---|---|---|
| FR1 | 3.2.1.1–3.2.1.4 | FR | `UNICAST` | Send/receive unicast; received only by the specified address; arrives in order. |
| FR2 | 3.2.2.3–3.2.2.6, 3.2.2.9 | FR | `MULTICAST_MEMBERSHIP` | Join/leave group; no delivery before join or after leave; receive from multiple groups simultaneously. |
| FR3 | 3.2.2.1, 3.2.2.2, 3.2.2.7, 3.2.2.8 | FR | `MULTICAST_MESSAGING` | Send/receive multicast; set TTL; set multicast address and port. |
| FR4 | 3.2.3.1, 3.2.3.2, 3.2.3.3 † | FR | `BROADCAST` | Send/receive broadcast; message **sent to** all possible hosts on the local network. |
| FR5 | 3.2.4.1–3.2.4.4 | FR | `UNICAST_SECURITY` | Encrypt/decrypt unicast; sender opts in or out per message; receiver decrypts automatically. |
| FR6 | 3.2.4.5, 3.2.4.6 | FR | `MULTICAST_SECURITY` | Encrypt/decrypt multicast using a group key from an allow-listing key holder. |
| FR7 | 3.2.5.1, 3.2.5.2 | FR | `CONVERSATION_ARCHITECTURE` | Agent-controlled and component-controlled conversation architectures. |
| NFR8 | 3.2.6.1 | NFR — Compatibility | `COMPAT_1_2` | New agentMom compatible with agentMom 1.2. |
| NFR9 | 2.4.1 | NFR — Reliability | `BEST_EFFORT_DELIVERY` | Multicast/broadcast delivered best-effort: to all specified agents, or none. |
| NFR10 | 2.4.2 | NFR — Security | `BASIC_SECURITY_ONLY` | Basic encryption provided; no guarantee others cannot decrypt. |

† 3.2.3.3 is printed as `3.3.3.3` in SRS v1.1 — an apparent numbering typo. Cited as 3.2.3.3 throughout, with the discrepancy noted.

**Wording discipline — non-negotiable.** FR4 is *"shall be **sent to** all possible hosts"* — **not** "shall reach." The SRS chose that verb deliberately, because 2.4.1 permits delivery to none. Any code comment, GUI label, log message or report sentence that says a broadcast "reaches" all hosts creates a contradiction with NFR9 and makes the broadcast test unverifiable. Same for NFR9: the SRS says *"all specified agents or none"* — binary. Do not write "some."

---

## 2. Business rule register

This is the layer v1 was missing: the SRS clauses restated as enforceable rules, each with an owning requirement and an implementing module. Every rule is falsifiable. Test conditions in §13 derive from here, not from prose.

| Rule | Statement | Source | Owner | Implemented in |
|---|---|---|---|---|
| **BR-01** | A unicast envelope is accepted only where `recipientId` equals the receiving agent's ID; otherwise it is dropped and logged as a protocol violation. | 3.2.1.3 | FR1 | `unicast-transport.ts` |
| **BR-02** | Unicast messages from one sender to one recipient are delivered in the order sent. | 3.2.1.4 | FR1 | TCP + `sequence-checker.ts` |
| **BR-03** | A `sequenceNumber` that is not `lastSeen + 1` for that sender raises `SEQUENCE_ANOMALY`. It is observability only; no resequencing occurs. | A1.2 | FR1 | `sequence-checker.ts` |
| **BR-04** | An agent must not receive multicast traffic for a group it has not joined. | 3.2.2.5 | FR2 | `group-membership-manager.ts` |
| **BR-05** | An agent must not receive multicast traffic for a group after it has left. | 3.2.2.6 | FR2 | `group-membership-manager.ts` |
| **BR-06** | `leave()` removes the group from the application-level membership set **synchronously, before** the OS `dropMembership` call. A datagram already in flight is dropped, not delivered. | A2.1 | FR2 | `group-membership-manager.ts` |
| **BR-07** | An agent may hold membership in more than one group at once, and each received datagram is attributed to exactly one group. | 3.2.2.9 | FR2 | `group-membership-manager.ts` |
| **BR-08** | A multicast envelope carries a TTL. Where the sender sets none, `DEFAULT_TTL_UNSUPPORTED_ASSUMPTION` applies. | A3.1 | FR3 | `multicast-framing.ts` |
| **BR-09** | A received multicast envelope with `ttl <= 0` is not passed to the application layer; `MESSAGE_DROPPED_TTL_EXPIRED` is raised. | A3.2 | FR3 | `multicast-transport.ts` |
| **BR-10** | A multicast destination must lie inside `224.0.0.0/4`. Anything else is rejected at send time. | Design | FR3 | `multicast-transport.ts` |
| **BR-11** | An encoded envelope exceeding `MAX_DATAGRAM_BYTES` is rejected at send time, not fragmented. | A3.3 | FR3 | `multicast-framing.ts` |
| **BR-12** | A broadcast is sent to the limited broadcast address, falling back to the subnet-directed address of the active interface where the OS does not route it. | A4.1 | FR4 | `broadcast-transport.ts` |
| **BR-13** | `EACCES` / `EPERM` on a broadcast send surfaces as `BROADCAST_PERMISSION_DENIED`, never as an unhandled crash. | 2.4.4 | FR4 | `broadcast-transport.ts` |
| **BR-14** | Encryption is a per-message decision made by the sender, not a global setting. | 3.2.4.3 | FR5 | `unicast-security.ts` |
| **BR-15** | A received envelope with `encrypted = true` is decrypted automatically, with no user action. | 3.2.4.4 | FR5 | `unicast-security.ts` |
| **BR-16** | An envelope with `encrypted = true` but missing `iv` or `authTag` is malformed: dropped and logged, with no decryption attempted. | A5.3 | FR5 | `envelope-validator.ts` |
| **BR-17** | A failed decryption fails closed — `DECRYPTION_FAILED` is raised and no partial plaintext is delivered. | 2.4.2 | FR5/FR6 | `symmetric.ts` |
| **BR-18** | The group key is issued only to agents on the key holder's allow-list. | 2.5.3 | FR6 | `key-holder-agent.ts` |
| **BR-19** | Key request and key response messages are always encrypted, overriding the BR-14 per-message choice. | A6.3 | FR6 | `key-holder-protocol.ts` |
| **BR-20** | `leave()` triggers no key rotation, revocation or re-issue. A departed agent retains a working key. | A6.2 | FR6 | `group-membership-manager.ts` |
| **BR-21** | Both conversation architectures implement one `ConversationHandler` interface and share the transport layer unchanged. | A7.1 | FR7 | `architecture/*.ts` |
| **BR-22** | The `AgentMom1_2` interface signatures are never modified. New capability is added alongside, never by changing an existing method. | A8.1 | NFR8 | `agentmom-1_2-adapter.ts` |
| **BR-23** | No acknowledgement, retry or resend path exists anywhere on the multicast or broadcast send/receive paths. | A9.2 | NFR9 | *(absence — verified statically)* |
| **BR-24** | No claim about encryption strength, key length or resistance is made in code comments, GUI text or reports. | 2.4.2 | NFR10 | *(discipline — verified by inspection)* |

**BR-23 and BR-24 are negative rules.** They are satisfied by the *absence* of code, so they are verified by static inspection rather than by execution. That is what makes NFR9 and NFR10 evaluable at all — see §17.

---

## 3. Constraint register

Constraints are not requirements: they bound the environment and generate **test preconditions and blockers**. v1 ignored these; they are where the honest BLOCKED cases come from.

| ID | Constraint | Source | Consequence |
|---|---|---|---|
| **CON-01** | TCP/IP for unicast; multicast protocol for multicast; UDP for broadcast. | 2.1.2 | Binds the transport choices in §9. Not negotiable — a WebSocket simulation would void every transport-level test. |
| **CON-02** | Multicast/broadcast delivery is best-effort: all specified agents, or none. | 2.4.1 | NFR9. Makes any "reaches all" expected result indefensible. |
| **CON-03** | Security is basic; no guarantee others cannot decrypt. | 2.4.2 | NFR10. Caps every security claim. |
| **CON-04** | Multicast requires router, NIC and OS support. | 2.4.3 | **Hard precondition** on every FR2/FR3 test. If unmet on the test machine, those cases are BLOCKED, not FAILED. Verify and record before execution. |
| **CON-05** | On many networks only an administrator may send broadcast. | 2.4.4 | Precondition for FR4. Basis for assumption A4.2 being labelled Unsupported. |
| **CON-06** | Agents know the destination address for unicast. | 2.5.1 | Precondition: address book seeded by the control plane. No discovery protocol is in scope. |
| **CON-07** | Agents know the multicast address. | 2.5.4 | Precondition: group address supplied by configuration. |
| **CON-08** | A key-holder agent exists and maintains an allow-list. | 2.5.3 | Basis for BR-18. Exactly one key holder per topology. |
| **CON-09** | agentMom is implemented in **Java**, requiring **java 1.4.0**. | 2.1, 2.1.1 | **Deviated from.** See §5.1. Directly invalidates NFR8's evaluation; declared, not hidden. |

---

## 4. Assumption register

One row per assumption. Exactly three labels are legal, per the assignment brief: **Supported by SRS**, **Design decision**, **Unsupported**. No hybrids. This register is the single source of truth — `ASSUMPTIONS.md` and the Part 1 report table both derive from it and must never drift.

| ID | Assumption | Label | Lives in |
|---|---|---|---|
| **A1.1** | TCP is the unicast transport. | Supported by SRS (2.1.2) | `unicast-transport.ts` |
| **A1.2** | Exactly one persistent TCP connection per ordered agent pair, so TCP's per-connection ordering suffices; no application resequencing is built. | **Design decision** — the SRS never specifies connection lifecycle, and ordering across a reconnect would not hold | `unicast-transport.ts` |
| **A2.1** | Leave takes effect immediately; in-flight datagrams are dropped. | Design decision | `group-membership-manager.ts` |
| **A2.2** | Destination-group attribution under simultaneous membership is achieved by binding one socket per joined group. | Design decision | `group-membership-manager.ts` |
| **A3.1** | A default TTL applies when the sender sets none. | **Unsupported** — SRS is silent | `multicast-framing.ts` |
| **A3.2** | TTL is *additionally* enforced at the receiving application layer (`ttl <= 0` → drop). This is a different mechanism from the router-hop definition in SRS §1.3. | Design decision | `multicast-transport.ts` |
| **A3.3** | Payloads above `MAX_DATAGRAM_BYTES` are rejected rather than fragmented. | Design decision — implementation safety rail, not SRS-derived | `multicast-framing.ts` |
| **A4.1** | Limited broadcast `255.255.255.255` satisfies "all possible hosts under the same local network," with a subnet-directed fallback. | Design decision — SRS names no address | `broadcast-transport.ts` |
| **A4.2** | The development and test machines permit broadcast without administrator restriction. | **Unsupported** — 2.4.4 states the opposite may hold | `broadcast-transport.ts` |
| **A5.1** | AES-256-GCM is used. | Design decision — SRS names no algorithm | `symmetric.ts` |
| **A5.2** | One shared symmetric key per unordered agent pair, derived deterministically; no key-exchange handshake. | **Unsupported** — 2.5.3 covers multicast only; SRS is silent on unicast keys | `unicast-security.ts` |
| **A5.3** | `encrypted = true` without `iv`/`authTag` is malformed and dropped. | Design decision | `envelope-validator.ts` |
| **A6.1** | A key holder exists and gates distribution by allow-list. | Supported by SRS (2.5.3) | `key-holder-agent.ts` |
| **A6.2** | The group key is never rotated or revoked on leave; a departed agent retains it. | **Unsupported** — SRS silent | `key-holder-agent.ts` |
| **A6.3** | Key request/response are always encrypted, overriding the 3.2.4.3 opt-out. | Design decision | `key-holder-protocol.ts` |
| **A7.1** | Both architectures share one transport layer behind a common interface. | Design decision | `architecture/*.ts` |
| **A7.2** | Architecture mode is switchable at runtime without restarting sockets. | Design decision — added for demonstrability; SRS does not require it | `architecture/*.ts` |
| **A8.1** | "Compatible" means the 1.2 public interface signatures are unchanged and new features are additive only. | Design decision — SRS does not define compatibility at interface level | `agentmom-1_2-adapter.ts` |
| **A8.2** | The 1.2 surface is reconstructed by us from SRS §2.2, because no reference implementation is obtainable. | **Unsupported** — a self-authored contract cannot evidence compatibility with the real 1.2 | `agentmom-1_2-adapter.ts` |
| **A9.1** | Best-effort delivery permits loss. | Supported by SRS (2.4.1) | — |
| **A9.2** | Therefore no ack/retry/resend layer exists. | **Design decision** — 2.4.1 permits failure but does not prohibit mitigation; choosing not to mitigate is ours | *(absence)* |
| **A10.1** | A standard symmetric algorithm suffices; AES-256-GCM chosen. | Design decision | `symmetric.ts` |
| **A10.2** | No strength, key-length or resistance claim is made or tested. | Supported by SRS (2.4.2 explicitly disclaims any guarantee) | *(discipline)* |
| **A11** | The GUI is a **test harness over the framework**, introduced to satisfy the assignment's observability requirement. The SRS specifies a developer framework (§2.1, §2.3) and contains no interface requirements. | Design decision — not traceable to any SRS clause | `packages/web/**` |

**A11 matters more than it looks.** No expected result anywhere in Part 3 may be asserted about the harness itself. Every expected result is asserted about framework behaviour *observed through* the harness. Getting this backwards is the fastest way to lose a viva.

---

## 5. Technology decisions

### 5.1 Language — and the declared deviation

**Decision: Node.js 20+ with TypeScript.** The assignment permits any language. The SRS does not: §2.1 says agentMom "is implemented in Java" and §2.1.1 requires java 1.4.0 (**CON-09**).

This deviation has one real consequence and it must be stated, not buried: **nothing written in TypeScript can be interface-compatible with a Java library.** NFR8's evaluation is therefore structurally invalid — we are inspecting a contract we authored ourselves against an implementation we also authored. You cannot fail that test.

We keep the deviation and **declare it** rather than switching to Java, because:
- The assignment is a *quality evaluation* exercise, not a build contest — 45 of 100 marks are for evaluation, 10 for the baseline.
- The rubric explicitly rewards "limitations recognized."
- The limitation converts directly into a legitimate BLOCKED case (TC-11's sibling in §17) instead of a fabricated pass.

Record this in `ASSUMPTIONS.md` under **A8.2** and in the Part 3A limitation column. Never present the 1.2 adapter as evidence of real compatibility.

### 5.2 The rest of the stack

| Layer | Choice | Rationale |
|---|---|---|
| Transport | Native `net` (TCP) and `dgram` (UDP) | CON-01 requires real OS-level primitives. A simulated in-memory bus would void every transport test and make FAILED/BLOCKED results meaningless. **Do not substitute a WebSocket fake.** |
| Agent process model | One Node **child process** per agent (`fork()`) | Real per-process sockets and ports; killing a process reproduces the SRS's own "Agent_B suffers a failure" narrative (Fig. 1). Requires per-process coverage config — see §12.4. |
| Control plane | Node + Express, single process | Spawns/kills agents, REST + WebSocket API, aggregates log streams. |
| Harness UI | **Vite + React + TypeScript** | Changed from Next.js. Same capability, far less framework scaffolding entering the SonarQube scan — which matters because Part 3A requires selecting ~5 *meaningful* findings, and framework noise makes that harder. |
| Crypto | Node `crypto`, AES-256-GCM | A5.1/A10.1. Authenticated encryption in one primitive, no external dependency. Do **not** move to asymmetric crypto — it would contradict A5.2 as written. |
| Persistence | None | The SRS describes a messaging framework, not a data-management system — which is also why zero FRs are CRUD. Adding a database would undercut that argument. |
| Test runner | **Vitest** + `supertest` | Vitest handles TS natively, emits lcov for SonarQube, and runs unit/component/integration from one config. |

---

## 6. Repository structure

```
agentmom/
├── README.md                       # setup + run instructions (named submission requirement)
├── ASSUMPTIONS.md                  # generated from §4 — one entry per assumption, file-linked
├── TEST-CONDITIONS.md              # generated from §13 — the COND-nn register
├── sonar-project.properties        # §12.4 — tests declared, coverage wired
├── vitest.config.ts
├── package.json                    # npm workspaces root
├── tsconfig.base.json
│
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── types/{message,agent-state,control-plane-api}.ts
│   │   │   ├── crypto/{symmetric,key-holder-protocol}.ts
│   │   │   ├── protocol/{unicast-framing,multicast-framing,broadcast-framing}.ts
│   │   │   ├── validation/envelope-validator.ts        # BR-16
│   │   │   ├── constants.ts                            # DEFAULT_TTL_*, MAX_DATAGRAM_BYTES
│   │   │   └── index.ts
│   │   └── tests/unit/**                               # COND-01..03, 08, 18, 24, 31..33, 45
│   │
│   ├── agent/
│   │   ├── src/
│   │   │   ├── main.ts, config.ts, ipc.ts
│   │   │   ├── transports/{unicast,multicast,broadcast}-transport.ts
│   │   │   ├── membership/group-membership-manager.ts  # BR-04..07
│   │   │   ├── security/{unicast,multicast}-security.ts
│   │   │   ├── key-holder/key-holder-agent.ts          # BR-18..20
│   │   │   ├── architecture/{agent-controlled,component-controlled}.ts
│   │   │   ├── legacy/agentmom-1_2-adapter.ts          # BR-22
│   │   │   ├── reliability/best-effort-simulator.ts    # demo aid only
│   │   │   └── sequence-checker.ts                     # BR-02, BR-03
│   │   └── tests/component/**                          # COND-04..05, 11..13, 19, 22..23, 26..27, 29, 36..38, 42, 48..49
│   │
│   ├── control-plane/
│   │   ├── src/
│   │   │   ├── main.ts, agent-registry.ts, agent-supervisor.ts
│   │   │   ├── rest/{agents,messages,groups,keys,admin}.routes.ts
│   │   │   ├── ws/live-events.ts
│   │   │   └── log-aggregator.ts
│   │   └── tests/integration/**                        # COND-06..07, 09, 14..17, 20..21, 34..35, 39..41, 43, 50, 52
│   │
│   └── web/                                            # Vite + React harness (A11)
│       ├── src/pages/{Dashboard,Unicast,Multicast,Broadcast,Security,Architecture,Compatibility,Admin}.tsx
│       ├── src/components/{AgentTopologyGraph,MessageComposer,MessageLog,GroupMembershipPanel,
│       │                   EncryptionToggle,ArchitectureSwitch,ReliabilityDial,StatusBadge}.tsx
│       └── src/lib/{api-client,ws-client}.ts
│
├── scripts/
│   ├── dev-up.sh
│   ├── spawn-demo-agents.sh
│   ├── verify-preconditions.sh                         # CON-04/05 check — run before any test session
│   └── freeze-baseline.sh
│
└── evidence/                                           # populated in Phases 12–14, NOT part of the frozen tree
    ├── sonarqube/
    ├── test-execution/
    └── jira/
```

**Build order rule:** `packages/core` must compile and pass its unit tests before anything else is touched. All three other packages depend on it, and re-declaring types per package is exactly the duplication SonarQube will flag.

---

## 7. Domain model and demo topology

Every agent is a standalone Node process with a unique `agentId`, one TCP listener for unicast, one UDP socket **per joined multicast group**, one UDP broadcast socket, a `role` (`standard` | `key-holder`), and a `conversationArchitecture` (`agent-controlled` | `component-controlled`).

### 7.1 Port model — read this before writing any socket code

v1 got this wrong and it would have silently broken FR2 and FR3.

> **IP multicast delivery is keyed on the pair *(group address, destination port)*.** A socket receives a datagram sent to `239.1.1.5:5007` **only if** it is bound to port `5007` *and* has joined `239.1.1.5`. Binding to a different port receives nothing — with no error and no packets. Agents are distinguished by `senderId` in the envelope, **never** by binding different ports.

| Port | Scope | Value | Notes |
|---|---|---|---|
| Unicast listener | Per agent | 7001–7004 | TCP. Distinct per agent — correct, unicast is point-to-point. |
| Multicast group port | **Per group, shared by all members** | 5007 (group α), 5008 (group β) | UDP. `reuseAddr: true` mandatory. All members of a group bind the same value. |
| Broadcast port | **Shared by all agents** | 9001 | UDP. `reuseAddr: true` mandatory, or the second bind throws `EADDRINUSE`. |
| Control/IPC port | Per agent | 8001–8004 | Agent ↔ control-plane status and log stream. This is what the v1 "multicast port" column should have been. |

### 7.2 Demo topology

Mirrors SRS Figures 1–4 so the harness can re-enact the use cases live.

| Agent | Role | Unicast | IPC | Groups at start | Role in the SRS figures |
|---|---|---|---|---|---|
| `agent-A` | standard | 7001 | 8001 | none | Initiates unicast (Fig. 2); joins group α mid-demo (Fig. 1) |
| `agent-B` | standard | 7002 | 8002 | α | Leaves group α mid-demo (Fig. 1) |
| `agent-C` | standard | 7003 | 8003 | α, β | Member throughout (Fig. 3); demonstrates BR-07 multi-group |
| `agent-D` | key-holder | 7004 | 8004 | α | Holds and distributes group keys (2.5.3); also a broadcast recipient |

Two groups exist — α `239.1.1.5:5007` and β `239.1.1.6:5008` — because BR-07 cannot be demonstrated with one.

---

## 8. Canonical message envelope

One envelope for all three transports. Encryption wraps `payload` only; metadata always travels in clear so a receiver can decide how to handle the body before parsing it.

```typescript
export type TransportMode = "unicast" | "multicast" | "broadcast";

export interface MessageEnvelope {
  id: string;              // uuid v4, generated at send time
  mode: TransportMode;
  senderId: string;
  recipientId?: string;    // required for unicast — BR-01 (3.2.1.3)
  groupAddress?: string;   // required for multicast — BR-07, BR-10 (3.2.2.8)
  sequenceNumber: number;  // per (senderId, recipientId) — BR-02/BR-03. NOT global.
  timestampSentMs: number;
  ttl?: number;            // multicast only — BR-08, BR-09 (3.2.2.7)
  encrypted: boolean;      // BR-14 (3.2.4.3) — sender's per-message choice
  payload: string;         // plaintext JSON, or base64 AES-GCM ciphertext when encrypted
  iv?: string;             // base64; present iff encrypted === true
  authTag?: string;        // base64; present iff encrypted === true
}

export interface DecryptedPayload {
  kind: "chat" | "ping" | "join-notify" | "leave-notify" | "task-bid" | "system";
  body: Record<string, unknown>;
}
```

**Invariants, enforced in `envelope-validator.ts`:**
1. `sequenceNumber` is scoped to `(senderId, recipientId)` for unicast. A global counter breaks BR-02's testability.
2. `ttl` appears on multicast envelopes only. On unicast and broadcast it is `undefined` — never repurposed as a generic hop limit.
3. `encrypted: false` ⟹ `iv` and `authTag` are `undefined`, not empty strings.
4. `encrypted: true` with either field missing ⟹ **malformed**. Log, drop, do not attempt decryption (BR-16). This is TC-12's target.
5. `groupAddress` outside `224.0.0.0/4` ⟹ rejected at send (BR-10). This is TC-09's target.

---

## 9. Transport implementation

### 9.1 Unicast — FR1

- **Connection model:** one persistent TCP connection per **ordered** pair, lazily established on first send, reused thereafter. `Map<agentId, net.Socket>` per agent. This is **A1.2** and it is the only reason BR-02 holds — TCP guarantees ordering *per connection*, not across connections.
- **Framing:** TCP is a byte stream. Every envelope is length-prefixed: 4-byte big-endian `UInt32` length, then UTF-8 JSON. Implement `encodeFrame(envelope): Buffer` and a streaming `FrameDecoder` that buffers partial reads. **A `data` event is not a message** — it may carry half a frame or three frames. Handle both; COND-02 and COND-03 test exactly this.
- **Addressing (BR-01):** the receiving agent checks `recipientId === self.agentId` at the application layer and drops mismatches as protocol violations. Yes, point-to-point TCP makes this nearly unreachable — implement it anyway, because it is what makes 3.2.1.3 *independently demonstrable* rather than "true because TCP."
- **Ordering (BR-02/BR-03):** `sequence-checker.ts` is **verification only**. On receipt, assert `sequenceNumber === lastSeen + 1`; on mismatch raise `SEQUENCE_ANOMALY`. **Do not build resequencing or buffering.** Resequencing would exceed what A1.2 justifies and would contradict the report.

### 9.2 Multicast membership — FR2

- **Socket per group (A2.2).** Node's `dgram` `message` event exposes `rinfo` describing the **sender**, not the destination group. With one shared socket across groups, attribution is ambiguous. Binding one socket per joined group removes the ambiguity and makes BR-07 cleanly testable. Every such socket: `dgram.createSocket({ type: "udp4", reuseAddr: true })`, bind the **group port**, then `addMembership(groupAddress)`.
- **Loopback:** call `setMulticastLoopback(true)` so a sender's own datagrams return to co-located agents. Without it the topology graph will not light up on a single host and the demo silently under-reports.
- **Application-level membership set.** `group-membership-manager.ts` holds `Set<string>` of joined group addresses *independent of* the OS call, because BR-04/BR-05 must hold even when the OS join is still in flight or the process is mid-startup. Every inbound datagram is checked against the set before it reaches the application layer.
- **BR-06 ordering is the whole point.** `leave()` must remove from the set **synchronously first**, then call `dropMembership`. The window in which the OS still delivers but the application already rejects is the *deliberately chosen* behaviour, not a race you stumbled into. Comment it with the A2.1 reference.
- **State machine:**
  ```
  NOT_MEMBER --join()--> JOINING --(addMembership resolves)--> MEMBER
  MEMBER     --leave()--> NOT_MEMBER    (set update synchronous; see BR-06)
  ```
- **Cross-check:** the envelope also carries `groupAddress`. Assert it matches the socket's group. A mismatch is a protocol violation event — a free invalid-input condition.

### 9.3 Multicast messaging — FR3

- **Send:** `sendMulticast(groupAddress, port, envelope)`. No length-prefix framing — UDP preserves message boundaries. Validate against BR-10 and BR-11 before sending.
- **TTL, at two levels, and be honest about which is which:**
  1. `socket.setMulticastTTL(envelope.ttl ?? DEFAULT_TTL)` — the real OS hop-count control, matching the SRS §1.3 definition.
  2. Stamp `ttl` into the envelope; the receiver treats `ttl <= 0` as expired and drops it (BR-09).

  **Level 2 is not what SRS §1.3 means by TTL.** §1.3 defines TTL as router hops before a router discards the packet. Level 2 involves no router and is enforced by the receiver. It exists only because level 1 has no observable effect on a single host. This is **A3.2** and it must be commented as such in the code — a reviewer who spots the divergence unprompted will assume it was an accident unless you say otherwise.
- **Default TTL:** the constant is named `DEFAULT_TTL_UNSUPPORTED_ASSUMPTION` and set to `1`. The name is deliberate: in a code review or SonarQube pass it reads as a flagged non-SRS-derived value, not a magic number.
- **Runtime address/port config (3.2.2.8):** `setMulticastAddress(agentId, groupAddress, port)` exposed as a distinct admin action with its own GUI control — separately clickable from "send a multicast message," so the requirement has its own demonstrable path.
- **Size cap (BR-11):** `MAX_DATAGRAM_BYTES = 60000`. Reject above it. This is a safety rail, **not** SRS-derived — never present it as such in report text.

### 9.4 Broadcast — FR4

- **Socket setup:** `reuseAddr: true` (mandatory — four agents share port 9001), then `setBroadcast(true)` after bind.
- **Address (BR-12):** send to `255.255.255.255`. Where the OS does not route it — macOS and some Windows configurations do not — fall back to the subnet-directed address derived from the active interface via `os.networkInterfaces()`. Log which address was used; it belongs in the test evidence.
- **Permission handling (BR-13):** catch `EACCES`/`EPERM` explicitly and surface `BROADCAST_PERMISSION_DENIED` with the text *"Broadcast permission denied by OS/network — see SRS constraint 2.4.4."* Never let it crash the agent.
- **A "simulate permission denied" toggle exists for demos only.** It force-throws the same path so the demo does not depend on the grading machine's permissions.

  > **Hard rule:** a simulated failure that the application handles correctly is a **PASS** of the error-handling test. It must never be cited as the evidence for a FAILED status. Doing so is precisely the relabelling the brief prohibits. The same applies to the drop-rate dial in §9.7.
- **Scope honesty:** the harness shows every agent's node flashing when a broadcast is sent. That evidences *host-local* reach only. It does **not** evidence 3.2.3.3's "all possible hosts under the same local network" — see TC-11.

### 9.5 Unicast security — FR5

- **Key model (A5.2):** one shared symmetric key per **unordered** pair, derived as `sha256(sorted([a, b]).join("|") + AGENTMOM_DEMO_SEED)`, seed in `.env`. Order-independence is what COND-33 tests.
- Comment it loudly:
  ```typescript
  // AI ASSUMPTION A5.2 — classified UNSUPPORTED in the Part 1 report.
  // The SRS specifies no key-exchange process for unicast (2.5.3 covers
  // multicast only). This deterministic pairwise derivation is a
  // development-time stand-in, chosen so the demo has *a* working key
  // without inventing a handshake the SRS also never asked for.
  // Do NOT present this as production key management. It is the flagged gap.
  ```
- **Opt-in/out (BR-14):** a per-message boolean on the composer, wired straight to `MessageEnvelope.encrypted`. Not a global setting.
- **Auto-decrypt (BR-15):** the receiver checks `encrypted`, looks up the pairwise key, decrypts before dispatch. No user action. On failure raise `DECRYPTION_FAILED` and deliver nothing (BR-17) — fail closed, never partially.

### 9.6 Multicast security — FR6

- **Key holder (BR-18, CON-08):** `agent-D` holds a `Set<agentId>` allow-list per group and a 32-byte `crypto.randomBytes(32)` group key generated once at startup per group.
  > **Allow-list ≠ current membership.** SRS 2.5.3 says the key holder maintains a list of agents *allowed to get the keys* — not a list of current members. The two can legitimately diverge, and the code must model the allow-list, not the membership set.
- **Protocol (BR-19):** a requesting agent sends `kind: "system"`, `{ action: "REQUEST_GROUP_KEY", groupAddress }` by unicast. The key holder checks the allow-list and replies with the base64 key. **These two messages are always encrypted**, hardcoded, overriding the BR-14 opt-out — sending a key in plaintext would be an obvious own-goal. Note it in `ASSUMPTIONS.md` as A6.3.
- **No rotation on leave (BR-20, A6.2):** `leave()` triggers nothing. A departed agent keeps a working key, and COND-41 tests exactly that — it is a *deliberate, flagged limitation*, and demonstrating it is worth more than hiding it.
  ```typescript
  // AI ASSUMPTION A6.2 — classified UNSUPPORTED in the Part 1 report.
  // The key holder issues one static group key to every allow-listed agent
  // and never rotates or revokes it on leave. A departed agent retains the
  // ability to decrypt group traffic. Deliberate simplification, not an
  // oversight. The SRS is silent on rotation.
  ```

### 9.7 Conversation architecture — FR7

- `agent-controlled.ts`: one `handleIncoming(envelope)` on the agent, containing the conversation state machine directly — *the agent controls the conversation*.
- `component-controlled.ts`: a `ConversationRouter` dispatching `DecryptedPayload.kind` to pluggable `ConversationComponent` instances (`PingComponent`, `TaskBidComponent`, `JoinLeaveComponent`) — *the agent's components control the conversation*.
- Both implement one `ConversationHandler` interface (BR-21). The transports in §9.1–9.4 are completely unaware of which is active — that is what proves A7.1 structurally rather than in prose.
- Switching at runtime (A7.2) replaces only the handler, never the sockets. The message log emits `ARCHITECTURE_SWITCHED` so a viva can point at the exact moment and show identical delivery either side.

### 9.8 Compatibility adapter — NFR8

```typescript
// BR-22 / A8.1 — DO NOT MODIFY THESE SIGNATURES.
// New capability is added ALONGSIDE this interface, never by changing it.
// A8.2 (UNSUPPORTED): this surface is OUR reconstruction from SRS §2.2.
// No agentMom 1.2 artifact was available, and this implementation is not on
// the JVM the SRS specifies (2.1/2.1.1, CON-09). It therefore CANNOT
// evidence real compatibility. See Part 3A limitation column.
export interface AgentMom1_2 {
  sendMessage(toAgentId: string, body: string): Promise<void>;
  onMessage(handler: (fromAgentId: string, body: string) => void): void;
}
```

Implemented as a thin wrapper over the new unicast transport with `encrypted: false` hardcoded (1.2 predates FR5). The legacy path has no branch that new features can break, because it is a strict subset wrapper — that is the honest claim, and it is the only one available.

### 9.9 Reliability simulator — NFR9

- Applies to **multicast and broadcast only**. Never to unicast, which is TCP-backed and reliable by construction; conflating them would contradict both CON-02 and A1.2.
- `dropRate: number` (0.0–1.0, default `0`), checked immediately before each send. On trigger: log `SIMULATED_DROP`, skip the send. No retry (BR-23).
- Label it in the UI as a testing aid: *"Simulates packet loss for NFR 2.4.1 observation. Default 0%. Real UDP loss can occur independently of this control."*
- Same hard rule as §9.4: a drop the app handles correctly is a **PASS**, never evidence of a FAILED case.
---

## 10. Control-plane API contract

Base `http://localhost:4000/api`. JSON throughout. Errors: `{ error: { code, message } }`.

**Agents**

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/agents` | — | `Agent[]` (id, role, status, ports, architectureMode, memberships[]) |
| POST | `/agents` | `{ agentId, role, unicastPort, ipcPort, architectureMode }` | `Agent` — forks a child process |
| DELETE | `/agents/:agentId` | — | `204` — kills the process (SRS Fig. 1 failure narrative) |
| PATCH | `/agents/:agentId/architecture` | `{ architectureMode }` | `Agent` — FR7 live switch |

**Messaging**

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/messages/unicast` | `{ senderId, recipientId, body, encrypted }` | `{ envelopeId }` |
| POST | `/messages/multicast` | `{ senderId, groupAddress, port, body, ttl, encrypted }` | `{ envelopeId }` |
| POST | `/messages/broadcast` | `{ senderId, port, body }` | `{ envelopeId, addressUsed }` |
| GET | `/messages/log` | query `agentId?`, `mode?`, `since?` | `MessageLogEntry[]` |

`addressUsed` is returned because BR-12 may fall back from limited to subnet-directed broadcast, and the test evidence needs to record which was used.

**Groups / Keys / Admin**

| Method | Path | Body | Maps to |
|---|---|---|---|
| POST | `/groups/:groupAddress/join` | `{ agentId }` | FR2 |
| POST | `/groups/:groupAddress/leave` | `{ agentId }` | FR2 |
| GET | `/groups/:groupAddress/members` | — | FR2 |
| PATCH | `/groups/:groupAddress/config` | `{ agentId, port }` | FR3 (3.2.2.8) |
| POST | `/keys/request` | `{ requestingAgentId, groupAddress }` | FR6 (BR-18) |
| GET | `/keys/:groupAddress/allowlist` | — | FR6 |
| PATCH | `/admin/reliability` | `{ dropRate }` | NFR9 demo aid |
| PATCH | `/admin/broadcast-permission` | `{ simulateDenied }` | FR4 demo aid |
| PATCH | `/admin/default-ttl` | `{ defaultTtl }` | FR3 (A3.1 demo) |

**WebSocket** `ws://localhost:4000/live` — `{ type, payload, ts }`.

Event types: `AGENT_SPAWNED`, `AGENT_KILLED`, `AGENT_STATUS`, `MESSAGE_SENT`, `MESSAGE_RECEIVED`, `MESSAGE_DROPPED_MEMBERSHIP`, `MESSAGE_DROPPED_TTL_EXPIRED`, `MESSAGE_DROPPED_SIMULATED`, `MESSAGE_MALFORMED`, `PROTOCOL_VIOLATION`, `DECRYPTION_FAILED`, `BROADCAST_PERMISSION_DENIED`, `SEQUENCE_ANOMALY`, `ARCHITECTURE_SWITCHED`, `GROUP_KEY_GRANTED`, `GROUP_KEY_DENIED`.

Every drop and failure mode gets its **own** event type rather than a generic error, because Table B's Evidence column then points at one named event instead of reconstructing intent from a log line.

---

## 11. Harness requirements

Per the Part 2 rubric: *"The GUI must expose the selected functional behaviours and display observable success/error feedback. Visual polish is secondary."*

Every page implements a three-state `StatusBadge`: **grey/pending** (submitted, awaiting confirmation), **green/success** (confirmed, with the confirming event named), **red/failure** (confirmed failed, with the specific event type shown as the reason).

Do not funnel everything through one toast. Each requirement gets its own status area so a viva can point at one screen per row without scrolling. A shared chronological `MessageLog` exists on the dashboard for the system-level view, but it supplements rather than replaces per-page feedback.

| Page | Requirements | Must expose |
|---|---|---|
| Dashboard | all | Topology graph, aggregated log, precondition banner (CON-04/CON-05 status) |
| Unicast | FR1, FR5 | Sender/recipient pickers, body, encrypt toggle, sequence readout, delivery confirmation or connection error |
| Multicast | FR2, FR3 | Per-agent join/leave with live `MEMBER`/`JOINING`/`NOT_MEMBER` badge, group address/port config form, TTL field, "send while leaving" button |
| Broadcast | FR4 | Send control, per-agent receipt indicator, `addressUsed` readout, simulate-denied toggle |
| Security | FR5, FR6 | Key-holder allow-list, per-agent "Request Group Key" with grant/deny, encrypted multicast composer (disabled without a key, with a tooltip saying why) |
| Architecture | FR7 | Per-agent mode radio, switch marker in the log |
| Compatibility | NFR8 | Legacy-only send panel that bypasses every new-feature control |
| Admin | NFR9, NFR10 | Drop-rate dial, default-TTL control, crypto configuration readout |

The **"send while leaving"** button on the Multicast page fires a leave and an inbound multicast from another agent within the same event-loop tick. It is the only way to demonstrate BR-06 deterministically, and it is TC-05's entry point.

---

## 12. Test architecture

### 12.1 The chain

Applied uniformly. Nothing enters a test case that does not trace back to a basis.

```
TEST BASIS      SRS clause · SRS use case · business rule (BR-nn) · declared assumption (A-nn)
     ↓
CONDITION       COND-nn — one falsifiable statement, tagged with its level
     ↓
TEST CASE       TC-nn — a Table B record
     ↓
RESULT          PASSED · FAILED · BLOCKED · NOT EXECUTED, with named evidence
     ↓
DEFECT          BUG-nn in Jira — only if confirmed, reproducible, and an implementation fault
```

The final arrow is conditional and that is deliberate. The brief is explicit: *"A test status and a defect are not the same thing, and not every failure or blocker should become a Jira bug."* §18 is the decision procedure.

### 12.2 Levels

| Level | Scope | Automated | Runner | In Table B? |
|---|---|---|---|---|
| **U — Unit** | Pure functions, no I/O: framing, crypto primitives, TTL predicate, sequence check, key derivation, envelope validation | Yes | Vitest | No — aggregate count + coverage only |
| **C — Component** | One module with real sockets on loopback, collaborators stubbed: each transport, membership manager, key holder, simulator, legacy adapter | Yes | Vitest | No — aggregate count + coverage only |
| **I — Integration** | 2+ real agent processes + control plane, no UI: cross-agent delivery, membership gating, key exchange, architecture switch | Yes | Vitest + supertest | **Selected** cases only |
| **S — System** | Through the harness UI, executed by a person, end-to-end, re-enacting SRS UC1–UC4 | **No — manual, per the brief** | Human | **Yes — all** |

**Why unit and component tests are not in Table B.** The brief caps the reported set at 12–15 and defines a system-level case as one that *"exercises the integrated application from a user-visible entry point to an observable end result; it is not a single function or isolated component test."* Filling Table B with unit tests would technically hit the count while dodging the work being assessed. They appear instead as aggregate evidence in Part 3A — count, pass rate, and coverage percentage — which is exactly where the brief lists coverage as relevant.

### 12.3 Component inventory

A "component" here is a module with one responsibility and its own socket or state: `unicast-transport`, `multicast-transport`, `broadcast-transport`, `group-membership-manager`, `sequence-checker`, `envelope-validator`, `unicast-security`, `multicast-security`, `key-holder-agent`, `agent-controlled` / `component-controlled` handlers, `agentmom-1_2-adapter`, `best-effort-simulator`. Twelve components, each with its own component-test file.

### 12.4 SonarQube configuration

```properties
sonar.projectKey=agentmom-se3002
sonar.sources=packages/core/src,packages/agent/src,packages/control-plane/src,packages/web/src
sonar.tests=packages/core/tests,packages/agent/tests,packages/control-plane/tests
sonar.test.inclusions=**/*.test.ts,**/*.spec.ts
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.exclusions=**/node_modules/**,**/dist/**,**/*.d.ts
```

Declaring `sonar.tests` separately from `sonar.sources` is what stops test code from inflating the code-smell count while still contributing coverage. Forked child processes need `c8`/`v8` coverage collection enabled in the child, or integration coverage silently reads as zero — verify this in Phase 0, not at freeze time.

---

## 13. Test condition register

Fifty-four conditions across all 10 requirements. Level tags: **U** unit, **C** component, **I** integration, **S** system. Category tags: **N** normal, **B** boundary, **E** invalid/error, **BR** business rule.

### FR1 — Unicast

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-01 | BR-02 | An envelope survives `encodeFrame` → `decode` unchanged at arbitrary size | U | N |
| COND-02 | BR-02 | A frame split across two `data` events is reassembled into exactly one envelope | U | B |
| COND-03 | BR-02 | Two frames coalesced into one `data` event are separated into exactly two envelopes | U | B |
| COND-04 | 3.2.1.1/.2 | A send establishes a connection and the addressed agent receives the envelope | C | N |
| COND-05 | BR-01 | An envelope whose `recipientId` ≠ this agent is dropped and raises `PROTOCOL_VIOLATION` | C | BR |
| COND-06 | 3.2.1.3 | A message sent A→B is not received by C | I | BR |
| COND-07 | 3.2.1.4 | 50 messages sent A→B arrive in the order sent | I | N |
| COND-08 | BR-03 | A `sequenceNumber` of `lastSeen + 2` raises `SEQUENCE_ANOMALY`; `lastSeen + 1` does not | U | B |
| COND-09 | A1.2 | Sending to a stopped agent surfaces a connection error, not a crash | I | E |
| COND-10 | SRS UC2 | Use Case 2 re-enacted end-to-end through the harness | S | N |

### FR2 — Multicast membership

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-11 | 3.2.2.3 | `join()` transitions `NOT_MEMBER` → `JOINING` → `MEMBER` | C | N |
| COND-12 | BR-04 | A datagram arriving before the group is in the membership set is dropped | C | B |
| COND-13 | BR-06 | `leave()` removes from the membership set **before** calling `dropMembership` | C | BR |
| COND-14 | 3.2.2.5 | A message sent to a group before an agent joins is not delivered to it | I | BR |
| COND-15 | 3.2.2.6 | A message sent to a group after an agent leaves is not delivered to it | I | BR |
| COND-16 | 3.2.2.9 / BR-07 | An agent joined to α and β receives from both, each attributed to the correct group | I | N |
| COND-17 | SRS UC1 | Use Case 1 (join/leave) re-enacted through the harness | S | N |
| COND-18 | BR-06 | A message inbound in the same event-loop tick as `leave()` is dropped, not delivered | I | B |

### FR3 — Multicast messaging

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-19 | BR-09 | `ttl = 1` is deliverable; `ttl = 0` is expired — exact boundary | U | B |
| COND-20 | 3.2.2.7 | A send applies `setMulticastTTL` and stamps `ttl` into the envelope | C | N |
| COND-21 | BR-09 | A received envelope with expired TTL raises `MESSAGE_DROPPED_TTL_EXPIRED` and is not delivered | I | BR |
| COND-22 | SRS §1.3 | OS-level `setMulticastTTL(0)` confines a datagram to the originating host | I | N |
| COND-23 | 3.2.2.8 | Group address and port are reconfigurable at runtime and take effect on the next send | C | N |
| COND-24 | BR-10 | A destination outside `224.0.0.0/4` is rejected at send time | C | E |
| COND-25 | BR-11 | A payload at exactly `MAX_DATAGRAM_BYTES` is accepted; at `+1` it is rejected — exact boundary | U | B |
| COND-26 | 3.2.2.1/.2 | A multicast send reaches every current member of the group | I | N |
| COND-27 | SRS UC3 | Use Case 3 re-enacted through the harness | S | N |

### FR4 — Broadcast

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-28 | BR-12 | The broadcast socket binds with `reuseAddr` and sets `setBroadcast(true)` after bind | C | N |
| COND-29 | 3.2.3.1/.2 | A broadcast send is received by every agent on the same host | I | N |
| COND-30 | 3.2.3.3 | A broadcast is **sent to** all possible hosts under the same local network | S | N |
| COND-31 | BR-13 | `EACCES`/`EPERM` surfaces as `BROADCAST_PERMISSION_DENIED`, not a crash | C | E |
| COND-32 | BR-12 | Where limited broadcast is not routed, the subnet-directed fallback is used and `addressUsed` reports it | C | E |
| COND-33 | SRS UC4 | Use Case 4 re-enacted through the harness | S | N |

### FR5 — Unicast security

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-34 | 3.2.4.1/.2 | AES-256-GCM encrypt → decrypt round-trips to the original plaintext | U | N |
| COND-35 | BR-17 | A tampered `authTag` causes decryption to throw; no plaintext is produced | U | E |
| COND-36 | A5.2 | Pairwise key derivation is order-independent: `key(A,B) === key(B,A)` | U | N |
| COND-37 | BR-16 | `encrypted = true` with `iv` or `authTag` missing is malformed: dropped, no decryption attempted | C | E |
| COND-38 | BR-14 | A message sent with `encrypted = false` travels as plaintext; the same body with `encrypted = true` differs on the wire | I | BR |
| COND-39 | 3.2.4.4 | The receiver decrypts automatically with no user action | I | N |
| COND-40 | BR-17 | Decryption with the wrong key raises `DECRYPTION_FAILED` and delivers nothing | I | E |

### FR6 — Multicast security

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-41 | BR-18 | An allow-listed agent's key request is granted | C | BR |
| COND-42 | BR-18 | A non-allow-listed agent's key request is denied and raises `GROUP_KEY_DENIED` | C | E |
| COND-43 | BR-19 | Key request and response are encrypted regardless of the sender's opt-out setting | I | BR |
| COND-44 | 3.2.4.5/.6 | An encrypted multicast is readable by key-holding members and raises `DECRYPTION_FAILED` for others | I | N |
| COND-45 | BR-20 / A6.2 | After leaving, an agent that already holds the group key can still decrypt captured traffic | I | BR |

### FR7 — Conversation architecture

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-46 | BR-21 | Both handlers satisfy the `ConversationHandler` interface | U | N |
| COND-47 | 3.2.5.1/.2 | Delivery behaviour is identical before and after a live architecture switch | I | N |
| COND-48 | A7.2 | A switch replaces only the handler; sockets and connections are not restarted | I | BR |
| COND-49 | 3.2.5.1/.2 | The switch is observable in the harness with an `ARCHITECTURE_SWITCHED` marker | S | N |

### NFR8 / NFR9 / NFR10

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-50 | BR-22 | The `AgentMom1_2` signature snapshot matches the frozen contract byte for byte | U | BR |
| COND-51 | 3.2.6.1 | A legacy-only send succeeds while every new feature is simultaneously active | S | N |
| COND-52 | BR-23 | No ack, retry or resend symbol exists on any multicast or broadcast path (static inspection) | C | BR |
| COND-53 | BR-23 / 2.4.1 | A dropped datagram is never retransmitted | I | BR |
| COND-54 | 2.4.2 | Ciphertext observed on the wire differs from the plaintext body | I | BR |

---

## 14. Reported test cases — Table B set

Fifteen cases, covering all seven FRs. NFR evaluation is Part 3A and uses its own table (§17), which is why Table B is FR-focused: the brief says *"Derive test conditions for all 7 FRs, then design and execute 12–15 test cases."*

| TC | Conditions | Requirement | Level | Category | Expected status |
|---|---|---|---|---|---|
| TC-01 | COND-10, 04 | FR1 | **S — manual** | Normal | PASSED |
| TC-02 | COND-06, 05 | FR1 | I | Business rule | PASSED |
| TC-03 | COND-07, 08 | FR1 | I | **Boundary** | PASSED |
| TC-04 | COND-17, 11 | FR2 | **S — manual** | Normal | PASSED |
| TC-05 | COND-18, 13 | FR2 | I | **Boundary** | PASSED |
| TC-06 | COND-16 | FR2 | I | Normal | PASSED *(at risk — see note)* |
| TC-07 | COND-19, 21 | FR3 | I | **Boundary** | PASSED |
| TC-08 | COND-22 | FR3 | I | Normal | **FAILED** |
| TC-09 | COND-24 | FR3 | I | **Invalid/error** | PASSED |
| TC-10 | COND-29, 33 | FR4 | **S — manual** | Normal | PASSED |
| TC-11 | COND-30 | FR4 | **S — manual** | Normal | **BLOCKED** |
| TC-12 | COND-37 | FR5 | I | **Invalid/error** | PASSED |
| TC-13 | COND-38, 39 | FR5 | I | Business rule | PASSED |
| TC-14 | COND-42 | FR6 | I | **Invalid/error** | PASSED |
| TC-15 | COND-47, 49 | FR7 | **S — manual** | Normal | PASSED |

**Brief compliance check:** boundary 3 (≥2 ✓) · invalid/error 3 (≥2 ✓) · manual system-level 5 (≥3 ✓) · genuine FAILED/BLOCKED 2, possibly 3 (≥2 ✓) · all 7 FRs covered ✓ · total 15 (12–15 ✓).

### 14.1 The two genuine failures — do not engineer these away

These are the hardest part of the assignment to satisfy honestly, and the reason is structural: **a well-built application produces no failures.** Every failure mode in §9 is handled, and a handled path behaving as designed is a PASS. The brief forbids manufacturing outcomes or relabelling passes. So the failures must be real ones that no amount of good engineering removes.

---

**TC-08 — OS-level multicast TTL confinement → FAILED**

*Basis:* SRS §1.3 defines TTL as the number of router hops before a packet is discarded.
*Expected:* a datagram sent with `setMulticastTTL(0)` is confined to the originating host and is not delivered to other agents.
*Predicted actual:* all co-located agents receive it. Hop count is a routing property; same-host delivery does not traverse a router.
*Status:* **FAILED** — executed, actual ≠ expected.

This is the single most valuable test in the submission, because the correct Part 4 verdict is **"failed, but not a defect."** The implementation does exactly what SRS §1.3 describes; the *test environment* has no router, so the mechanism the SRS relies on has nothing to act on. Reporting this correctly demonstrates the distinction the brief asks for in one move: *"A test status and a defect are not the same thing."*

It also does something better. It proves that A3.2 — the application-level TTL check — is doing all the observable work, which is precisely why A3.2 was flagged as a divergence from §1.3 rather than presented as satisfying 3.2.2.7. Execute this deliberately. **Do not add a workaround before executing it.**

---

**TC-11 — Broadcast sent to all hosts on the local network → BLOCKED**

*Basis:* SRS 3.2.3.3 — *"Broadcast message shall be sent to all possible hosts under the same local network."*
*Precondition required:* a multi-host local network with enumerable membership, so "all possible hosts" can be established and receipt confirmed at each.
*Precondition available:* a single-machine test bed. One host.
*Status:* **BLOCKED** — the case cannot execute, because the precondition does not exist.

This is the brief's own textbook BLOCKED definition: *"could not be completed because a required precondition, dependency, environment, or earlier step prevented execution."* Record the exact reason and the evidence (network configuration, host count). **Do not** claim a broadcast failure that was never executed — TC-10 already establishes host-local delivery and passes; TC-11 is strictly about LAN-scale reach and is a different claim.

---

**TC-06 — a third candidate, genuinely uncertain**

Multi-group attribution (COND-16). With the one-socket-per-group design in §9.2 this should pass. If a shared socket is used instead, `rinfo` exposes the sender rather than the destination group, attribution becomes ambiguous, and this fails. Build it per §9.2 and let the result be whatever it is. Do not pre-declare an outcome.

### 14.2 What must never be cited as a failure

The simulate-permission-denied toggle and the drop-rate dial produce failures the application **handles correctly**. Those are PASSes of error-handling conditions (COND-31, COND-53). Citing either as evidence for a FAILED status is the exact relabelling the brief prohibits, and it is trivially detectable in a viva by asking *"so what actually broke?"*

---

## 15. Traceability matrix — Table C skeleton

| Requirement | Business rules | Conditions | Test cases | Result | Defect |
|---|---|---|---|---|---|
| FR1 — 3.2.1.1–.4 | BR-01, 02, 03 | COND-01…10 | TC-01, 02, 03 | | |
| FR2 — 3.2.2.3–.6, .9 | BR-04, 05, 06, 07 | COND-11…18 | TC-04, 05, 06 | | |
| FR3 — 3.2.2.1, .2, .7, .8 | BR-08, 09, 10, 11 | COND-19…27 | TC-07, 08, 09 | | |
| FR4 — 3.2.3.1–.3 | BR-12, 13 | COND-28…33 | TC-10, 11 | | |
| FR5 — 3.2.4.1–.4 | BR-14, 15, 16, 17 | COND-34…40 | TC-12, 13 | | |
| FR6 — 3.2.4.5, .6 | BR-18, 19, 20 | COND-41…45 | TC-14 | | |
| FR7 — 3.2.5.1, .2 | BR-21 | COND-46…49 | TC-15 | | |
| NFR8 — 3.2.6.1 | BR-22 | COND-50, 51 | *Part 3A* | | |
| NFR9 — 2.4.1 | BR-23 | COND-52, 53 | *Part 3A* | | |
| NFR10 — 2.4.2 | BR-24 | COND-54 | *Part 3A* | | |

Result and Defect columns are populated during Phases 13–14. Every condition not carried by a Table B case is carried by an automated U/C/I test — record the test file path in the execution log so the matrix has no orphans.

---

## 16. Predicted SonarQube findings

Part 3A needs *"approximately five meaningful findings"* interpreted — what was reported, where, why it matters, and what action the evidence supports. These six are predictable in advance because they are consequences of decisions already made. Knowing them turns a scramble into a prepared analysis.

| # | Trigger | Likely rule / area | Honest interpretation | Action the evidence supports |
|---|---|---|---|---|
| 1 | `sha256(pair + SEED)` key derivation, seed in `.env` (§9.5) | Security hotspot — weak or hardcoded key derivation | Accurate. This is assumption **A5.2**, already classified Unsupported, made visible by a tool rather than by our own disclosure. The tool independently found the gap we declared. | None for the baseline — the gap is deliberate and declared. A real fix means a key-exchange protocol the SRS never specified. |
| 2 | `Math.random() < dropRate` (§9.9) | S2245 — insecure PRNG | Rule matches, but the finding is **not security-relevant here**: it seeds a demo aid, not a key. This is the clearest example of a true finding that does not warrant the action it implies. | Suppress with justification, or replace with `crypto.randomInt` to keep the report clean. Document either way — the reasoning is the deliverable, not the fix. |
| 3 | Three structurally similar transports (§9.1–9.4) | Duplicated blocks — maintainability | Genuine. Send/receive/log skeletons repeat across unicast, multicast and broadcast. | Extract a shared skeleton — **after the freeze**, on the fix branch. Do not touch the evaluated baseline. |
| 4 | `DecryptedPayload.kind` dispatch (§9.7) | Cognitive complexity | Genuine, and it grows with the component-controlled architecture. A direct consequence of supporting both FR7 variants. | Component-controlled routing already reduces it; note the contrast between the two handlers as evidence. |
| 5 | Membership-gate drops (§9.2) | Reliability — swallowed condition / empty block | Deliberate per BR-04/BR-05, but a silent drop is indistinguishable from a bug to a reviewer or a scanner. | Add an explicit `MESSAGE_DROPPED_MEMBERSHIP` log at the drop site so intent is legible to both. |
| 6 | `unknown` / `any` in IPC payloads | Maintainability | Genuine and cheap to fix — the strongest "action clearly supported by evidence" example available. | Type the IPC channel properly. Fix on the branch, post-freeze. |

Pick five. **Do not** lead with the Quality Gate status or an issue count — the brief says explicitly that *"merely listing ratings, issue counts, or the Quality Gate status is not interpretation."*

---

## 17. NFR evaluation plan — Part 3A

All three NFRs share one problem, and it is worth stating plainly: **none is falsifiable as written.**

- NFR8 requires compatibility with an artifact we do not possess, in a language we are not using (CON-09).
- NFR9 permits delivery to all agents *or none* — every observation satisfies it.
- NFR10 explicitly disclaims any guarantee — nothing is promised, so nothing can be checked.

This is not a flaw in the selection. It is a property of the SRS, and the brief anticipates it: *"If the SRS gives no defensible threshold, report that limitation instead of inventing one."* Declaring it is scored; inventing a threshold is not.

Each NFR is therefore evaluated against a **falsifiable surrogate**, with the gap between requirement and surrogate stated in the Limitation column.

| NFR | SonarQube evidence | Other method | Surrogate evaluated | Limitation to declare |
|---|---|---|---|---|
| **NFR8** — 3.2.6.1 Compatibility | Maintainability rating on `legacy/`; duplication between adapter and new transport | Interface-contract inspection (COND-50) + manual system test (COND-51, TC-15) | The `AgentMom1_2` signatures are unchanged by any new feature, and a legacy-only call path succeeds while every new feature is active | **The evaluation cannot validate real compatibility.** No agentMom 1.2 artifact was obtainable, and this implementation is not on the JVM the SRS specifies (2.1/2.1.1). The contract inspected is our own reconstruction (A8.2, Unsupported). A self-authored contract cannot fail. |
| **NFR9** — 2.4.1 Reliability | Reliability rating and bugs on `transports/` and `reliability/` | Static inspection for absent retry paths (COND-52) + observed non-retransmission (COND-53) | No ack, retry or resend path exists, and a dropped datagram is never resent | **The SRS sets no delivery-rate threshold**, so no pass/fail rate can be asserted. The SRS's binary wording ("all specified agents or none") also does not admit the partial delivery real UDP produces — a divergence between the constraint and observable behaviour, recorded as a finding rather than resolved. |
| **NFR10** — 2.4.2 Security | Security rating, vulnerabilities, and security hotspots — including finding #1 in §16 | Component test on fail-closed decryption (COND-35) + wire observation (COND-54) | Ciphertext on the wire differs from plaintext, and a wrong key fails closed with an authentication error rather than a silent partial decrypt | **No strength claim is made or tested.** The SRS names no algorithm, key length or resistance target, and 2.4.2 explicitly disclaims any guarantee (A10.2). SonarQube's own hotspot on the key derivation independently confirms the declared A5.2 gap. |

The NFR9 row is the most interesting of the three, because the surrogate tests the **absence** of code. That is unusual and worth being ready to defend: BR-23 is satisfied by there being no retry path, so the evidence is a static search that returns nothing, plus an observed drop with no retransmission on the wire.

---

## 18. Defect protocol — Part 4

The brief: *"Investigate every FAILED or BLOCKED test before deciding whether it represents a defect… Log only confirmed, reproducible implementation defects in Jira."*

### 18.1 Decision procedure

For every FAILED or BLOCKED result, in order:

1. **Is the expected result defensible?** Trace it to an SRS clause, a business rule, or a declared assumption. If the expected result came from a paraphrase rather than the source, fix the expected result — the test was wrong, not the code. *(This is exactly the trap the FR4 "reach" vs "sent to" wording would have set.)*
2. **Were the preconditions met?** Check CON-04 (multicast support) and CON-05 (broadcast permission) via `verify-preconditions.sh`. Unmet precondition → **BLOCKED, not a defect.**
3. **Is it reproducible?** Run three times. Not reproducible → do not log it; record the observation and the non-reproduction attempt.
4. **Is the cause in our implementation, or in the environment / the SRS?** Environment or specification → **not a defect.** Record it as a finding with its evidence.
5. Only if 1–4 all point at our code: log **BUG-nn** in Jira.

### 18.2 Applying it to the known results

| Result | Step that resolves it | Verdict |
|---|---|---|
| TC-08 FAILED — TTL confinement | Step 4. The implementation matches SRS §1.3. The test bed has no router, so hop count has nothing to act on. | **Not a defect.** Record as an environment-bounded finding, and cite it as evidence that A3.2 carries the observable behaviour. |
| TC-11 BLOCKED — LAN-wide broadcast | Step 2. The multi-host precondition does not exist. | **Not a defect.** Record the blocker and its evidence. |
| NFR8 evaluation | Step 2. The 1.2 reference artifact is unobtainable. | **Not a defect.** Declared as a Part 3A limitation. |
| Anything found during Phase 13 | Full procedure | **Defect only if it survives all five steps.** |

**A submission with two genuine failures and zero Jira defects is a valid outcome** — provided the investigation is documented. It demonstrates the distinction the brief is testing. It is far stronger than logging non-defects to make the Jira board look populated, which inverts exactly the judgement being assessed.

### 18.3 Jira record format

Each defect: short specific title · affected environment and build (git tag) · preconditions · minimal reproduction steps · expected result **with its basis cited** · actual result · reproducibility (n of 3) · severity · priority · evidence attachment · related TC-nn · workflow status.

---

## 19. Build phases

Fifteen phases. Each states entry criteria, requirement rows advanced, files, implementation notes, test artifacts produced, and exit criteria. Do not advance while an exit criterion is unmet — a phase that "mostly works" compounds into silent gaps three phases later.

---

### Phase 0 — Scaffolding and core primitives

**Entry:** empty repository.
**Advances:** foundation for all rows.

**Tasks**
- npm workspaces root; `packages/{core,agent,control-plane,web}`; `tsconfig.base.json`.
- Vitest config with lcov reporter; `sonar-project.properties` per §12.4.
- `core/src/types/message.ts` — `MessageEnvelope`, `DecryptedPayload` (§8).
- `core/src/constants.ts` — `DEFAULT_TTL_UNSUPPORTED_ASSUMPTION = 1`, `MAX_DATAGRAM_BYTES = 60000`.
- `core/src/crypto/symmetric.ts` — AES-256-GCM as **pure functions**, no socket coupling.
- `core/src/protocol/unicast-framing.ts` — `encodeFrame` + streaming `FrameDecoder`.
- `core/src/validation/envelope-validator.ts` — the five §8 invariants.
- `ASSUMPTIONS.md` and `TEST-CONDITIONS.md` generated from §4 and §13.

**Notes.** Verify child-process coverage collection now. If `c8` does not instrument forked processes, integration coverage reads zero and you will not discover it until the SonarQube run — six phases too late to fix cheaply.

**Tests:** COND-01, 02, 03, 08, 19, 25, 34, 35, 36, 46, 50.
**Exit:** `packages/core` compiles; all listed unit tests pass; `npm run coverage` emits a non-empty lcov.

---

### Phase 1 — Unicast transport

**Entry:** Phase 0 exit met. **Advances:** FR1. **Rules:** BR-01, 02, 03.

**Tasks**
- `agent/src/main.ts`, `config.ts`, `ipc.ts`.
- `transports/unicast-transport.ts` — TCP server + lazily-established persistent client pool per §9.1.
- `sequence-checker.ts` — verification only. **No resequencing.**
- `control-plane`: `agent-supervisor.ts` (fork/kill, restart-on-crash **off** — visible crashes are wanted), `/agents` and `/messages/unicast`.

**Notes.** The frame decoder must survive a `data` event carrying half a frame and one carrying three. Test it before wiring the control plane, or every later bug will look like a transport bug.

**Tests:** COND-04, 05 (C); COND-06, 07, 09 (I).
**Exit:** via curl — spawn A and B, POST A→B, confirm receipt, confirm 50-message ordering, confirm C receives nothing, confirm a stopped recipient yields a clean error.

---

### Phase 2 — Multicast membership

**Entry:** Phase 1 exit met. **Advances:** FR2. **Rules:** BR-04, 05, 06, 07.

**Tasks**
- `transports/multicast-transport.ts` — **one socket per joined group**, `reuseAddr: true`, bind the **group port**, `addMembership`, `setMulticastLoopback(true)`.
- `membership/group-membership-manager.ts` — state machine, application-level set, synchronous-remove-before-drop.
- `/groups/:groupAddress/{join,leave,members}`.

**Notes.** Re-read §7.1 before writing bind code. If members bind different ports, nothing arrives and nothing errors. Comment BR-06's ordering with its A2.1 reference at the line where it happens.

**Tests:** COND-11, 12, 13 (C); COND-14, 15, 16, 18 (I).
**Exit:** three agents; two joined; the third receives nothing; leave stops delivery immediately; an agent in both α and β receives from both with correct attribution.

---

### Phase 3 — Multicast messaging and TTL

**Entry:** Phase 2 exit met. **Advances:** FR3. **Rules:** BR-08, 09, 10, 11.

**Tasks**
- `sendMulticast` with BR-10 range validation and BR-11 size cap.
- Two-level TTL per §9.3, with the A3.2 divergence comment.
- `PATCH /groups/:groupAddress/config`; `PATCH /admin/default-ttl`.

**Notes.** Comment level 1 and level 2 TTL separately and say plainly which one the SRS means. **Do not add a workaround for COND-22.** It is TC-08 and it is meant to fail.

**Tests:** COND-20, 23, 24 (C); COND-21, 22, 26 (I).
**Exit:** TTL-expired messages dropped and logged; runtime address/port reconfiguration takes effect; out-of-range address rejected; **COND-22 executed and its result recorded whatever it is.**

---

### Phase 4 — Broadcast

**Entry:** Phase 3 exit met. **Advances:** FR4. **Rules:** BR-12, 13.

**Tasks**
- `broadcast-transport.ts` — `reuseAddr`, `setBroadcast(true)` after bind, limited-broadcast send with subnet-directed fallback.
- `EACCES`/`EPERM` → `BROADCAST_PERMISSION_DENIED`.
- `/messages/broadcast` returning `addressUsed`; `/admin/broadcast-permission`.
- `scripts/verify-preconditions.sh` — reports CON-04 and CON-05 status.

**Notes.** All four agents on port 9001 requires `reuseAddr` on every socket. Never write "reaches all hosts" in a log line, label or comment — 3.2.3.3 says *sent to*.

**Tests:** COND-28, 31, 32 (C); COND-29 (I).
**Exit:** all four demo agents receive a single broadcast; the simulate toggle produces a visible handled error, not a crash; `addressUsed` is reported and logged.

---

### Phase 5 — Unicast security

**Entry:** Phase 4 exit met. **Advances:** FR5. **Rules:** BR-14, 15, 16, 17.

**Tasks**
- `security/unicast-security.ts` — pairwise derivation, encrypt on send, auto-decrypt on receive.
- Wire `envelope-validator` into the receive path for BR-16.
- The A5.2 comment block from §9.5, verbatim.

**Tests:** COND-37 (C); COND-38, 39, 40 (I).
**Exit:** encrypted round-trip auto-decrypts; a malformed envelope is dropped without a decryption attempt; a wrong key raises `DECRYPTION_FAILED` and delivers nothing.

---

### Phase 6 — Multicast security and key holder

**Entry:** Phase 5 exit met. **Advances:** FR6. **Rules:** BR-18, 19, 20.

**Tasks**
- `key-holder/key-holder-agent.ts` — **allow-list**, per-group key, grant/deny.
- `crypto/key-holder-protocol.ts` — request/response, always encrypted (BR-19).
- `security/multicast-security.ts`; `/keys/request`, `/keys/:groupAddress/allowlist`.
- The A6.2 comment block from §9.6, verbatim.

**Notes.** Model the allow-list, not the membership set — SRS 2.5.3 says *allowed to get the keys*. COND-45 requires a departed agent to keep working keys; that is BR-20 behaving correctly, not a leak to fix.

**Tests:** COND-41, 42 (C); COND-43, 44, 45 (I).
**Exit:** allow-listed grant; non-allow-listed denial; key traffic encrypted even with the toggle off; a departed agent still decrypts.

---

### Phase 7 — Conversation architecture

**Entry:** Phase 6 exit met. **Advances:** FR7. **Rules:** BR-21.

**Tasks**
- `ConversationHandler` interface; `agent-controlled.ts`; `component-controlled.ts` with `ConversationRouter` and three components.
- `PATCH /agents/:agentId/architecture` — handler swap only, sockets untouched.

**Tests:** COND-46 (U); COND-47, 48 (I).
**Exit:** live switch with unchanged delivery behaviour and no socket restart; `ARCHITECTURE_SWITCHED` emitted.

---

### Phase 8 — Legacy adapter and reliability simulator

**Entry:** Phase 7 exit met. **Advances:** NFR8, NFR9. **Rules:** BR-22, 23.

**Tasks**
- `legacy/agentmom-1_2-adapter.ts` with the §9.8 comment block **in full**, including A8.2.
- `reliability/best-effort-simulator.ts`; `/admin/reliability`.
- Signature snapshot test for COND-50.

**Tests:** COND-52 (C); COND-53 (I); COND-50 (U).
**Exit:** legacy send works with every new feature simultaneously active; `dropRate = 1.0` drops all multicast/broadcast while unicast in the same batch remains 100% delivered; static search confirms no retry path.

---

### Phase 9 — Harness UI

**Entry:** Phase 8 exit met. **Advances:** all rows (observability). **Assumption:** A11.

**Tasks**
- All eight pages and eight components from §11, wired to REST + WebSocket.
- Three-state `StatusBadge` on every page with the named event as the failure reason.
- Dashboard precondition banner surfacing CON-04/CON-05.
- The "send while leaving" control — TC-05's entry point.

**Exit:** walk all 10 rows in §1 and confirm each has a dedicated clickable path with visible success and error states. Confirm no label anywhere claims a broadcast "reaches" all hosts.

---

### Phase 10 — Pre-freeze verification

**Entry:** Phase 9 exit met.

- All U/C/I suites green; coverage report generated and non-zero for every package.
- `ASSUMPTIONS.md` matches §4 exactly — 24 entries, each with a file path and one of exactly three labels.
- `TEST-CONDITIONS.md` matches §13 — 54 entries.
- Every §4 assumption has a findable comment in its named file.
- Re-enact SRS Figures 1–4 in the harness.
- `README.md` documents node version, install, `npm run dev-up`, and demo-topology spawn.
- Confirm nothing outside §1 was built; check against §21.

**Exit:** all boxes ticked. Nothing is edited after this point until Phase 14.

---

### Phase 11 — Freeze

- `scripts/freeze-baseline.sh`: git tag `baseline-v1`, commit this plan and `ASSUMPTIONS.md` as-built, zip `packages/` to `baseline-frozen.zip`.
- Record the tag hash. It goes in every Jira defect's environment field.

> **From here the baseline is immutable.** Fixes discovered in Phases 12–14 go on `fix/post-baseline`, created *after* all evidence is collected. The tag is never moved. The brief: *"Keep the baseline unchanged while collecting SonarQube and test evidence."*

---

### Phase 12 — SonarQube (Part 3A)

- Scan the **complete frozen codebase**. Not selected files. Not snippets.
- Export the full report to `evidence/sonarqube/`.
- Select five findings, cross-referencing §16 — but report what the scan **actually** produced, not what was predicted. Where a prediction missed, that is itself worth a sentence.
- For each: what was reported, where, why it matters, what action the evidence supports.
- Record coverage percentage per package as NFR context.

---

### Phase 13 — Test execution (Part 3B)

- Run `verify-preconditions.sh` first and record CON-04/CON-05 status. This is what makes a later BLOCKED verdict defensible rather than an excuse.
- Execute all 15 Table B cases against the **frozen** build.
- Manual system cases (TC-01, 04, 10, 11, 15) executed by a person through the harness, with screenshots.
- Capture the named WebSocket event as evidence for each case.
- Record actual results verbatim. **Do not adjust a case because it failed.**
- Complete Table C.

---

### Phase 14 — Defect triage and final judgment (Part 4)

- Apply §18.1 to every FAILED and BLOCKED result.
- Log only survivors as `BUG-nn` in Jira, in the §18.3 format.
- Export the Jira evidence to `evidence/jira/`.
- Write the 300–400 word final judgment. It must state: what the combined evidence supports; what remains unsupported; how the AI-introduced assumptions affected confidence; and whether the 10-requirement scope is acceptable — **scoped strictly to what was evaluated.**

**Anchor the judgment on these, not on the Quality Gate:**
- Seven Unsupported or environment-bounded assumptions (A3.1, A4.2, A5.2, A6.2, A8.2) mean confidence is uneven across the scope, not uniformly high.
- The three NFRs were evaluated against surrogates, not against the requirements as written. Say so.
- FR1–FR7 functional behaviour is supported by executed evidence; 3.2.3.3 at LAN scale is not evidenced at all.
- Only after that: whether the scope is acceptable, and under what conditions.

---

## 20. Definition of done

The baseline is ready to freeze when, and only when:

1. All 10 rows in §1 have working, demonstrable code paths.
2. All 24 assumptions in §4 have loud, findable comments in their named files.
3. Every FR and NFR has a dedicated harness page or panel with visible success and error states.
4. The four-agent topology boots from one script and re-enacts SRS Figures 1–4 live.
5. All U/C/I suites pass; coverage is non-zero for every package and lcov is emitted.
6. `ASSUMPTIONS.md` (24 entries) and `TEST-CONDITIONS.md` (54 entries) match §4 and §13 exactly.
7. `README.md` documents exact setup and run steps.
8. No text anywhere claims a broadcast "reaches" all hosts, or that delivery is to "some" recipients.
9. Nothing outside §1 has been built.

---

## 21. Non-goals

- **No database or persistence.** Contradicts the zero-CRUD argument in Part 1.
- **No authentication or login.** Not part of any selected requirement.
- **No retry, ack or reliability layer** on multicast or broadcast. Contradicts BR-23 and A9.2.
- **No key rotation, revocation, or asymmetric/PKI key exchange.** Contradicts A5.2 and A6.2 as written and would invalidate COND-45.
- **No resequencing buffer on unicast.** Contradicts A1.2. The sequence checker observes; it does not correct.
- **No Docker, Kubernetes or cloud deployment.** This is a localhost demo for a viva.
- **No workaround for COND-22.** It is TC-08 and it is meant to fail.
- **No automated system-level test tooling.** The brief requires ≥3 manual system cases and notes automation is not expected at that level. Unit, component and integration automation **is** in scope and is required — see §12.

---

## 22. Handover note

When this document goes to Claude Code, give it §0 through §11 first and let it build Phases 0–9. Hold §12 onward until Phase 10 — the test architecture is for you to execute after the freeze, not for the builder to satisfy in advance. Handing over the expected-failure analysis in §14.1 before the code exists risks the builder "helpfully" fixing TC-08, which would remove the most valuable evidence in the submission.
